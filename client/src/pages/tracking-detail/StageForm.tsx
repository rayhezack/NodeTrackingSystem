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
  toAttachmentTextArray,
  toTrackingAttachments,
} from './design-handoff.utils';
import {
  buildStageUpdateRequest,
  buildStageCompletionRequest,
  shouldReturnToWorkbenchAfterCompletion,
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

type FormValue = string | unknown[];

// 从 detail 的所有阶段字段分组中获取字段值
function getFieldValue(
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
  if (field.type === 'user') return toTrackingUserRefs(val);
  if (field.type === 'attachment') return toTrackingAttachments(val);
  if (val == null) return '';
  if (field.type === 'date') return toDateTimeInputValue(val);
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
}: StageFormProps) => {
  const stageConfig: StageConfig | undefined = SIDEBAR_STAGES.find((s) => s.id === stageId);
  const [formData, setFormData] = useState<Record<string, FormValue>>({});
  const [dirtyFieldNames, setDirtyFieldNames] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  // 初始化表单数据
  useEffect(() => {
    if (!stageConfig) return;
    const initial: Record<string, FormValue> = {};
    for (const field of stageConfig.fields) {
      initial[field.key] = getFieldValue(detail, field);
    }
    setFormData(initial);
    setDirtyFieldNames(new Set());
  }, [stageConfig, detail]);

  if (!stageConfig) {
    return null;
  }

  const handleChange = (key: string, value: FormValue) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    const field = stageConfig.fields.find((item) => item.key === key);
    if (field) {
      setDirtyFieldNames((prev) => new Set(prev).add(field.baseField));
    }
  };

  const serializeFields = (): Record<string, unknown> => {
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
        fields[field.baseField] = toAttachmentTextArray(value);
      } else {
        fields[field.baseField] = toTextValue(value);
      }
    }
    return fields;
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
    setCompleting(true);
    try {
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
  const busy = saving || completing;
  const disabled = !canEdit || busy;
  const completionCopy = getCompletionCopy(stageId, stageConfig.label);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-medium text-foreground">{stageConfig.label}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {canEdit ? '编辑以下字段，完成后点击保存' : '当前用户无编辑权限，字段为只读状态'}
        </p>
      </div>

      {stageId === 'design' && (
        <div className="space-y-4">
          <AiTrackingDraftPanel
            detail={detail}
            canEdit={canEdit}
            actorId={actorId}
            actorLarkId={actorLarkId}
            onApplied={onRelatedEventsChanged || onSaved}
          />
          <RelatedEventsPanel
            detail={detail}
            canEdit={canEdit}
            actorId={actorId}
            actorLarkId={actorLarkId}
            onSelectEvent={onSelectEvent}
            onChanged={onRelatedEventsChanged || onSaved}
          />
        </div>
      )}

      {stageId === 'dev' && (
        <DesignHandoffPanel detail={detail} />
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {stageConfig.fields.map((field) => (
          <div
            key={field.key}
            className={field.type === 'textarea' || field.type === 'attachment' ? 'md:col-span-2' : ''}
          >
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              {field.label}
              {field.required && <span className="ml-0.5 text-destructive">*</span>}
            </Label>
            {field.type === 'input' && (
              <Input
                value={toTextValue(formData[field.key])}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange(field.key, e.target.value)
                }
                disabled={disabled}
                placeholder={field.placeholder}
                className="rounded-sm h-8 text-sm"
              />
            )}
            {field.type === 'url' && (
              <Input
                type="url"
                required={field.required}
                value={toTextValue(formData[field.key])}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange(field.key, e.target.value)
                }
                disabled={disabled}
                placeholder={field.placeholder}
                className="rounded-sm h-8 text-sm"
              />
            )}
            {field.type === 'date' && (
              <Input
                type="datetime-local"
                value={toTextValue(formData[field.key])}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange(field.key, e.target.value)
                }
                disabled={disabled}
                className="rounded-sm h-8 text-sm"
              />
            )}
            {field.type === 'textarea' && (
              <Textarea
                value={toTextValue(formData[field.key])}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  handleChange(field.key, e.target.value)
                }
                disabled={disabled}
                placeholder={field.placeholder}
                rows={4}
                className="rounded-sm text-sm resize-none"
              />
            )}
            {field.type === 'select' && (
              <Select
                value={toTextValue(formData[field.key])}
                onValueChange={(value: string) => handleChange(field.key, value)}
                disabled={disabled}
              >
                <SelectTrigger className="rounded-sm h-8 text-sm w-full">
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
                onChange={(value) => handleChange(field.key, value)}
                disabled={disabled}
                placeholder={field.placeholder}
              />
            )}
          </div>
        ))}
      </div>

      {stageId === 'design' && (
        <div className="border-t border-border pt-6">
          <ParamDesigner
            recordId={detail.recordId}
            source={detail.source}
            evtId={toTextValue(formData.evtId) || detail.evtId}
            canEdit={detail.permissions.canEditParams}
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
            className="rounded-sm"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? '保存中...' : '保存'}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={disabled || !nodeActive || nodeCompleted}
                size="sm"
                className="rounded-sm"
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
            <AlertDialogContent className="rounded-sm">
              <AlertDialogHeader>
                <AlertDialogTitle>{completionCopy.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {completionCopy.description}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-sm">取消</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-sm"
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
      description: '开发状态将转为“已开发”，并进入埋点校验。',
    },
    acceptance: {
      buttonLabel: '完成验收',
      title: '确认完成数据验收？',
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
