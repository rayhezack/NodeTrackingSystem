import { useState, useEffect } from 'react';
import {
  Save,
  Loader2,
  CheckCircle2,
  LockKeyhole,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { SingleDatePicker } from '@client/src/components/ui/single-date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Label } from '@client/src/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@client/src/components/ui/alert-dialog';
import { UserSelect } from '@client/src/components/business-ui/user-select';
import {
  SIDEBAR_STAGES,
  isUiNodeActive,
  isUiNodeCompleted,
  type StageConfig,
} from './stage-config';
import { updateTrackingRecord } from '@client/src/api/tracking';
import type {
  TrackingDetail,
  WorkflowNotificationResult,
} from '@shared/api.interface';
import ParamDesigner from './param-designer/ParamDesigner';
import RelatedEventsPanel from './RelatedEventsPanel';
import DesignHandoffPanel from './DesignHandoffPanel';
import AiTrackingDraftPanel from './AiTrackingDraftPanel';
import UiImageField from './UiImageField';
import {
  toAttachmentFieldValue,
  toAttachmentTextArray,
  toTrackingAttachments,
} from './design-handoff.utils';
import {
  buildStageUpdateRequest,
  buildStageCompletionRequest,
  shouldReturnToWorkbenchAfterCompletion,
  getTrackingUserFieldValue,
  toTrackingUserRefs,
} from './stage-form.utils';

interface StageFormProps {
  stageId: string;
  detail: TrackingDetail;
  canEdit: boolean;
  actorId?: string;
  actorLarkId?: string;
  onSaved?: () => void;
  onArchiveCompleted?: () => void;
  onSavedPatch?: (fields: Record<string, FormValue>, currentStage: string) => void;
  onSelectEvent?: (recordId: string) => void;
  onRelatedEventsChanged?: (recordId?: string) => void | Promise<void>;
  draft?: StageDraft;
  onDraftChange?: (key: string, value: FormValue) => void;
  onUploadStateChange?: (uploading: boolean) => void;
  draftsBusy?: boolean;
  pendingDraftCount?: number;
  onSaveAllDrafts?: () => void | Promise<void>;
}

const DETAIL_FIELD_GROUPS = [
  'requirementFields',
  'designFields',
  'reviewFields',
  'devFields',
  'acceptanceFields',
  'launchFields',
  'archiveFields',
] as const;

const APP_HANDLER_OPTIONS = [
  { value: '客户端', label: '客户端' },
  { value: '客户端/服务端', label: '客户端/服务端' },
];

const WEB_HANDLER_OPTIONS = [
  { value: '前端', label: '前端' },
  { value: '服务端', label: '服务端' },
  { value: '前端/服务端', label: '前端/服务端' },
];

export type FormValue = string | unknown[];

export interface StageDraft {
  formData: Record<string, FormValue>;
}

interface FieldSection {
  title: string;
  description?: string;
  fields: StageConfig['fields'];
}

function getFieldSections(stageId: string, fields: StageConfig['fields']): FieldSection[] {
  const groups: Record<string, { title: string; description?: string; keys: string[] }> = {
    requirement: {
      title: '需求概览',
      keys: ['requestName', 'priority', 'platform', 'expectedCompletionDate'],
    },
    design: {
      title: '事件基本信息',
      keys: ['evtId', 'eventName', 'priority', 'platform', 'handler'],
    },
    review: { title: '评审结论', keys: ['reviewStatus', 'reviewComment'] },
    dev: { title: '开发状态', keys: ['devStatus'] },
    acceptance: { title: '验收记录', keys: ['acceptanceStatus', 'acceptanceTime', 'acceptanceEvidence'] },
    launch: { title: '上线监控', keys: ['monitorStatus'] },
    archive: { title: '归档信息', keys: ['officialStatus', 'archiveTime'] },
  };

  if (stageId === 'requirement') {
    const people = fields.filter((field) => field.type === 'user');
    const context = fields.filter((field) => ['requirementLink', 'requirementBackground', 'metricScenario'].includes(field.key));
    return [
      createSection(groups.requirement, fields),
      { title: '项目参与人', description: '参与人用于节点权限和流程通知。', fields: people },
      { title: '需求上下文', fields: context },
    ].filter((section) => section.fields.length > 0);
  }

  if (stageId === 'design') {
    const base = createSection(groups.design, fields);
    const definition = fields.filter((field) => ['eventDefinition', 'triggerTiming', 'commonProps', 'requestNotes'].includes(field.key));
    const materials = fields.filter((field) => field.key === 'uiImages');
    const version = fields.filter((field) => ['version', 'minVersion', 'changeType'].includes(field.key));
    return [
      base,
      { title: '事件口径', fields: definition },
      { title: '设计素材', fields: materials },
      { title: '版本与变更', fields: version },
    ].filter((section) => section.fields.length > 0);
  }

  const configured = groups[stageId];
  return configured ? [createSection(configured, fields)] : [{ title: '字段', fields }];
}

function createSection(
  config: { title: string; description?: string; keys: string[] },
  fields: StageConfig['fields'],
): FieldSection {
  return {
    title: config.title,
    description: config.description,
    fields: config.keys.map((key) => fields.find((field) => field.key === key)).filter(Boolean) as StageConfig['fields'],
  };
}

export function serializeStageFields(
  stageConfig: StageConfig,
  formData: Record<string, FormValue>,
  dirtyFieldNames: Set<string>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const field of stageConfig.fields) {
    const value = formData[field.key];
    if (field.required && !toTextValue(value).trim()) {
      throw new Error(`请填写${field.label}`);
    }
    if (
      field.type === 'url' &&
      dirtyFieldNames.has(field.baseField) &&
      toTextValue(value) &&
      !isHttpUrl(toTextValue(value))
    ) {
      throw new Error(`${field.label}必须是有效的 http 或 https 链接`);
    }
    if (field.type === 'user') {
      fields[field.baseField] = toTrackingUserRefs(value);
    } else if (field.type === 'attachment') {
      fields[field.baseField] = toAttachmentFieldValue(value);
    } else {
      fields[field.baseField] = toTextValue(value);
    }
  }
  return fields;
}

// 从 detail 的所有阶段字段分组中获取字段值
export function getFieldValue(
  detail: TrackingDetail,
  field: StageConfig['fields'][number],
): FormValue {
  let val: unknown;
  for (const groupName of DETAIL_FIELD_GROUPS) {
    const group = detail[groupName] || {};
    if (Object.prototype.hasOwnProperty.call(group, field.baseField)) {
      val = group[field.baseField];
      break;
    }
  }
  if (field.type === 'user') {
    return getTrackingUserFieldValue(detail, field.baseField, val);
  }
  if (field.type === 'attachment') return toTrackingAttachments(val);
  if (val == null) return '';
  if (field.type === 'date') return toDateInputValue(val);
  if (field.baseField === '端') return toPlatformText(val);
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && 'text' in first) {
      return String((first as { text: string }).text);
    }
  }
  return String(val);
}

const StageForm = ({
  stageId,
  detail,
  canEdit,
  actorId,
  actorLarkId,
  onSaved,
  onArchiveCompleted,
  onSavedPatch,
  onSelectEvent,
  onRelatedEventsChanged,
  draft,
  onDraftChange,
  pendingDraftCount = 0,
  onSaveAllDrafts,
  onUploadStateChange,
  draftsBusy = false,
}: StageFormProps) => {
  const stageConfig: StageConfig | undefined = SIDEBAR_STAGES.find((s) => s.id === stageId);
  const [localFormData, setFormData] = useState<Record<string, FormValue>>({});
  const [localDirtyFieldNames, setDirtyFieldNames] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const usesDrafts = stageId === 'design' && Boolean(onDraftChange);
  const initial = Object.fromEntries((stageConfig?.fields || []).map((field) => [field.key, getFieldValue(detail, field)]));
  const formData = usesDrafts ? { ...initial, ...draft?.formData } : localFormData;
  const dirtyFieldNames = usesDrafts
    ? new Set((stageConfig?.fields || []).filter((field) => Object.prototype.hasOwnProperty.call(draft?.formData || {}, field.key)).map((field) => field.baseField))
    : localDirtyFieldNames;

  useEffect(() => {
    if (usesDrafts || !stageConfig) return;
    setFormData(Object.fromEntries(stageConfig.fields.map((field) => [field.key, getFieldValue(detail, field)])));
    setDirtyFieldNames(new Set());
  }, [detail, stageConfig, usesDrafts]);

  if (!stageConfig) return null;

  const handleChange = (key: string, value: FormValue) => {
    if (usesDrafts) {
      onDraftChange?.(key, value);
      return;
    }
    setFormData((prev) => ({ ...prev, [key]: value }));
    const field = stageConfig.fields.find((item) => item.key === key);
    if (field) setDirtyFieldNames((prev) => new Set(prev).add(field.baseField));
  };

  const serializeFields = (): Record<string, unknown> => {
    return serializeStageFields(stageConfig, formData, dirtyFieldNames);
  };

  const getDirtyLocalFields = (): Record<string, FormValue> => {
    const fields: Record<string, FormValue> = {};
    for (const field of stageConfig.fields) {
      if (dirtyFieldNames.has(field.baseField)) {
        fields[field.baseField] = formData[field.key];
      }
    }
    return fields;
  };

  const handleSave = async () => {
    if (!canEdit) return;
    if (usesDrafts && onSaveAllDrafts) {
      try { await onSaveAllDrafts(); } catch (error) {
        toast.error(error instanceof Error ? error.message : '保存失败');
      }
      return;
    }
    if (dirtyFieldNames.size === 0) {
      toast.info('没有需要保存的修改');
      return;
    }
    setSaving(true);
    try {
      const fields = serializeFields();

      const request = buildStageUpdateRequest(
        stageId,
        fields,
        dirtyFieldNames,
      );
      const response = await updateTrackingRecord(detail.recordId, {
        ...request,
        actorId,
        actorLarkId,
      });
      toast.success('保存成功');
      setDirtyFieldNames(new Set());
      onSavedPatch?.(getDirtyLocalFields(), response.currentStage);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '保存失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!canEdit) return;
    if (stageId === 'launch' && formData.monitorStatus !== '通过') {
      toast.error('上线监控状态必须为“通过”才能完成上线');
      return;
    }
    setCompleting(true);
    try {
      if (usesDrafts && pendingDraftCount > 0) await onSaveAllDrafts?.();
      const fields = serializeFields();
      const request = buildStageCompletionRequest(
        stageId,
        fields,
        dirtyFieldNames,
      );
      const response = await updateTrackingRecord(detail.recordId, {
        ...request,
        actorId,
        actorLarkId,
      });
      showCompletionToast(stageConfig.label, response.notification);
      if (shouldReturnToWorkbenchAfterCompletion(stageId) && onArchiveCompleted) {
        onArchiveCompleted();
        return;
      }
      await onSaved?.();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '标记完成失败';
      toast.error(msg);
    } finally {
      setCompleting(false);
    }
  };

  const officialStatus = toTextValue(detail.archiveFields['正式状态'] as FormValue);
  const nodeCompleted = isUiNodeCompleted(
    detail.stage,
    stageConfig.uiNode,
    detail.reviewStatus,
    officialStatus,
  );
  const nodeActive = isUiNodeActive(
    detail.stage,
    stageConfig.uiNode,
    detail.reviewStatus,
    officialStatus,
  );
  const busy = saving || completing || draftsBusy;
  const disabled = !canEdit || busy;
  const completionCopy = getCompletionCopy(stageId, stageConfig.label);
  const fieldSections = getFieldSections(stageId, stageConfig.fields);
  const checklistFields = stageConfig.fields.filter((field) => field.required);
  const checklistComplete = checklistFields.filter((field) => Boolean(toTextValue(formData[field.key]).trim())).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-medium text-foreground">{stageConfig.label}</h2>
        {(!canEdit || usesDrafts) && (
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            {!canEdit ? '只读 · 无编辑权限' : `${pendingDraftCount ? `${pendingDraftCount} 个埋点未保存 · ` : ''}切换保留草稿，需统一保存；参数即时保存。`}
          </p>
        )}
      </div>

      {(stageId === 'review' || stageId === 'acceptance') && checklistFields.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-card p-4" aria-label="完成检查清单">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">完成检查清单</h3>
            </div>
            <span className="text-xs font-medium tabular-nums text-primary">{checklistComplete}/{checklistFields.length}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {checklistFields.map((field) => {
              const complete = Boolean(toTextValue(formData[field.key]).trim());
              return (
                <div key={field.key} className="flex items-center gap-2 rounded-md bg-card px-3 py-2 text-xs">
                  <span className="sr-only">{complete ? '已完成：' : '未完成：'}</span>
                  <CheckCircle2 aria-hidden="true" className={`h-4 w-4 shrink-0 ${complete ? 'text-emerald-600' : 'text-muted-foreground/40'}`} />
                  <span className={complete ? 'text-foreground' : 'text-muted-foreground'}>{field.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stageId === 'design' && (
        <div className="space-y-4">
          <AiTrackingDraftPanel
            detail={detail}
            canEdit={canEdit && !busy}
            actorId={actorId}
            actorLarkId={actorLarkId}
            onApplied={onRelatedEventsChanged || onSaved}
          />
          <RelatedEventsPanel
            detail={detail}
            canEdit={canEdit && !busy}
            actorId={actorId}
            actorLarkId={actorLarkId}
            onSelectEvent={onSelectEvent}
            onChanged={onRelatedEventsChanged || onSaved}
          />
        </div>
      )}

      {stageId === 'dev' && (
        <DesignHandoffPanel detail={detail} actorId={actorId} actorLarkId={actorLarkId} />
      )}

      <div className="space-y-5">
        {fieldSections.map((section) => (
          <section key={section.title} className="space-y-3 border-b border-border/60 pb-5 last:border-b-0 last:pb-0">
            {(fieldSections.length > 1 || section.title !== stageConfig.label) && (
              <div>
                <h3 className="text-sm font-medium text-foreground">{section.title}</h3>
                {section.description && <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
            {section.fields.map((field) => (
          <div key={field.key} className={field.type === 'textarea' || field.type === 'attachment' ? 'md:col-span-2' : ''}>
            <Label htmlFor={`stage-${stageId}-${field.key}`} className="mb-1.5 block text-xs text-muted-foreground">
              {field.label}
              {field.required && <span className="ml-0.5 text-destructive">*</span>}
            </Label>
            {field.type === 'input' && (
              <Input
                id={`stage-${stageId}-${field.key}`}
                value={toTextValue(formData[field.key])}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange(field.key, e.target.value)
                }
                disabled={disabled}
                placeholder={field.placeholder}
                className="h-9 rounded-md text-sm"
              />
            )}
            {field.type === 'url' && (
              <Input
                id={`stage-${stageId}-${field.key}`}
                type="url"
                required={field.required}
                value={toTextValue(formData[field.key])}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange(field.key, e.target.value)
                }
                disabled={disabled}
                placeholder={field.placeholder}
                className="h-9 rounded-md text-sm"
              />
            )}
            {field.type === 'date' && (
              <SingleDatePicker
                value={toTextValue(formData[field.key])}
                onChange={(value) => handleChange(field.key, value)}
                disabled={disabled}
              />
            )}
            {field.type === 'textarea' && (
              <Textarea
                id={`stage-${stageId}-${field.key}`}
                value={toTextValue(formData[field.key])}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  handleChange(field.key, e.target.value)
                }
                disabled={disabled}
                placeholder={field.placeholder}
                rows={3}
                className="min-h-20 resize-y rounded-md text-sm"
              />
            )}
            {field.type === 'select' && (
              <Select
                value={toTextValue(formData[field.key])}
                onValueChange={(value: string) => handleChange(field.key, value)}
                disabled={disabled}
              >
                <SelectTrigger id={`stage-${stageId}-${field.key}`} className="h-9 w-full rounded-md text-sm">
                  <SelectValue placeholder={`请选择${field.label}`} />
                </SelectTrigger>
                <SelectContent>
                  {getOptionsForField(field, detail).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {field.type === 'user' && (
              <UserSelect
                multiple
                valueType="object"
                accountType="apaas"
                value={toTrackingUserRefs(formData[field.key])}
                onChange={(value) => handleChange(field.key, Array.isArray(value) ? value : [])}
                disabled={disabled}
                placeholder={`搜索${field.label}`}
                tagClosable={!disabled}
                needFullFields
                includeExternalContacts={false}
              />
            )}
            {field.type === 'attachment' && (
              <UiImageField
                value={toTrackingAttachments(formData[field.key])}
                source={detail.source}
                pageUrl={toTextValue(formData.uiPageUrl)}
                onPageUrlChange={(value) => handleChange('uiPageUrl', value)}
                onUploadStateChange={onUploadStateChange}
                onChange={(value) => handleChange(field.key, value)}
                disabled={disabled}
                placeholder={field.placeholder}
              />
            )}
          </div>
        ))}
            </div>
          </section>
        ))}
      </div>

      {stageId === 'design' && (
        <div className="border-t border-border pt-6">
          <ParamDesigner
            recordId={detail.recordId}
            source={detail.source}
            evtId={toTextValue(formData.evtId) || detail.evtId}
            canEdit={detail.permissions.canEditParams && !busy}
            actorId={actorId}
            actorLarkId={actorLarkId}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {nodeCompleted ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              节点已完成
            </>
          ) : nodeActive ? (
            <>
              <span className="h-2 w-2 rounded-full bg-primary" />
              当前节点
            </>
          ) : (
            <>
              <LockKeyhole className="h-4 w-4" />
              尚未到达
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={disabled}
            variant="outline"
            size="sm"
            className="rounded-full"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving || draftsBusy ? '处理中...' : usesDrafts ? `保存全部修改${pendingDraftCount ? `（${pendingDraftCount}）` : ''}` : '保存'}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={disabled || !nodeActive || nodeCompleted}
                size="sm"
                className="rounded-full"
              >
                {completing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {nodeCompleted
                  ? '已完成'
                  : nodeActive
                    ? completionCopy.buttonLabel
                    : '尚未到达'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>{completionCopy.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {completionCopy.description}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">取消</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full"
                  onClick={handleComplete}
                >
                  确认完成
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};

function getOptionsForField(field: StageConfig['fields'][number], detail: TrackingDetail) {
  if (field.baseField === '端') {
    return detail.source === 'web'
      ? [{ value: 'Web', label: 'Web' }]
      : (field.options || []).filter((option) => option.value !== 'Web');
  }
  if (field.baseField === '处理方') {
    return detail.source === 'web' ? WEB_HANDLER_OPTIONS : APP_HANDLER_OPTIONS;
  }
  return field.options || [];
}

function showCompletionToast(label: string, notification?: WorkflowNotificationResult) {
  if (!notification) {
    toast.success(`${label}已标记完成`);
    return;
  }

  if (!notification.configured) {
    toast.warning(`${label}已标记完成，但机器人通知未配置`);
    return;
  }

  if (notification.sentCount > 0 && notification.failedCount === 0 && notification.skippedCount === 0) {
    toast.success(`${label}已标记完成，已通知 ${notification.sentCount} 人`);
    return;
  }

  const issue = [
    ...(notification.errors || []),
    ...(notification.skippedReasons || []),
  ][0];
  if (notification.sentCount > 0) {
    toast.warning(
      `${label}已标记完成，通知部分送达：成功 ${notification.sentCount}/${notification.recipientCount}${issue ? `，${issue}` : ''}`,
    );
    return;
  }

  if (notification.failedCount === 0 && notification.skippedCount > 0) {
    toast.warning(
      `${label}已标记完成，通知未发送${issue ? `：${issue}` : ''}`,
    );
    return;
  }

  toast.error(
    `${label}已标记完成，但通知发送失败：成功 0/${notification.recipientCount}${issue ? `，${issue}` : ''}`,
  );
}

export default StageForm;

function getCompletionCopy(stageId: string, stageLabel: string) {
  const copies: Record<string, { buttonLabel: string; title: string; description: string }> = {
    requirement: {
      buttonLabel: '完成提需',
      title: '确认完成需求录入？',
      description: '将保存当前修改，并把流程推进到埋点设计。',
    },
    design: {
      buttonLabel: '提交评审',
      title: '确认完成埋点设计？',
      description: '将保存当前修改，评审状态转为“评审中”，并进入埋点评审。',
    },
    review: {
      buttonLabel: '确认通过',
      title: '确认完成埋点评审？',
      description: '将保存评审意见，评审状态转为“已通过”，并进入埋点开发。',
    },
    dev: {
      buttonLabel: '完成开发',
      title: '确认完成埋点开发？',
      description: '开发状态将转为“已开发”，并进入埋点验收。',
    },
    acceptance: {
      buttonLabel: '完成验收',
      title: '确认完成埋点验收？',
      description: '将记录验收状态和当前时间，并进入埋点上线。',
    },
    launch: {
      buttonLabel: '完成上线',
      title: '确认完成埋点上线？',
      description: '发布与监控将标记完成，记录当前时间，并进入归档。',
    },
    archive: {
      buttonLabel: '完成归档',
      title: '确认完成归档？',
      description: '正式状态将标记为“已上线”，并记录稳定归档时间。',
    },
  };

  return copies[stageId] || {
    buttonLabel: '确认完成',
    title: `确认完成${stageLabel}？`,
    description: '将保存当前修改并标记该节点已完成。',
  };
}

function toTextValue(value: FormValue | undefined): string {
  if (Array.isArray(value)) return value.join('、');
  return value || '';
}

function toPlatformText(value: unknown): string {
  const items = Array.isArray(value)
    ? value.map(textValue).filter(Boolean)
    : textValue(value)
      ? [textValue(value)]
      : [];
  if (items.includes('Web')) return 'Web';
  const hasIos = items.some((item) => item === 'iOS');
  const hasAndroid = items.some((item) => item === 'Android');
  if (hasIos && hasAndroid) return 'iOS、Android';
  return items.join('、');
}

function toDateTimeInputValue(value: unknown): string {
  const raw = textValue(value).trim();
  if (!raw) return '';
  const timestamp = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw.replace(' ', 'T'));
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  const localTimestamp = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(localTimestamp).toISOString().slice(0, 16);
}

function toDateInputValue(value: unknown): string {
  const raw = textValue(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function toStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return uniqueStrings(value.map(extractNumericUserId).filter(Boolean));
  }
  if (typeof value === 'string') {
    return uniqueStrings(value
      .split(/[、,，/]/)
      .map((item) => item.trim())
      .filter((item) => /^\d+$/.test(item)));
  }
  return [];
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function extractNumericUserId(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? String(value) : '';
  if (typeof value === 'string') return /^\d+$/.test(value.trim()) ? value.trim() : '';
  if (!value || typeof value !== 'object') return '';

  const user = value as Record<string, unknown>;
  for (const key of [
    'user_id',
    'userId',
    'userID',
    'miaoda_user_id',
    'miaodaUserID',
    'employee_id',
    'employeeID',
    'id',
  ]) {
    const id = extractNumericUserId(user[key]);
    if (id) return id;
  }
  return '';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}
