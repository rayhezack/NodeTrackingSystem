import { useState, useEffect } from 'react';
import { getAppId } from '@lark-apaas/client-toolkit';
import { getDefaultBucketId } from '@lark-apaas/client-toolkit/tools/storage';
import {
  Save,
  Loader2,
  Upload,
  X,
  Eye,
  ExternalLink,
  Image as ImageIcon,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { UserSelect } from '@client/src/components/business-ui/user-select';
import { uploadFile } from '@client/src/components/business-ui/api/files/service';
import {
  SIDEBAR_STAGES,
  isUiNodeActive,
  isUiNodeCompleted,
  type StageConfig,
} from './stage-config';
import { resolveUiImagePreview, updateTrackingRecord } from '@client/src/api/tracking';
import type {
  TrackingAttachment,
  TrackingDetail,
} from '@shared/api.interface';
import ParamDesigner from './param-designer/ParamDesigner';
import RelatedEventsPanel from './RelatedEventsPanel';
import DesignHandoffPanel from './DesignHandoffPanel';
import {
  buildStageUpdateRequest,
  buildStageCompletionRequest,
  toTrackingUserRefs,
} from './stage-form.utils';

interface StageFormProps {
  stageId: string;
  detail: TrackingDetail;
  canEdit: boolean;
  actorId?: string;
  actorLarkId?: string;
  onSaved?: () => void;
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
  if (field.type === 'attachment') return toAttachmentArray(val);
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
      if (
        field.type === 'url' &&
        dirtyFieldNames.has(field.baseField) &&
        toTextValue(value) &&
        !isHttpUrl(toTextValue(value))
      ) {
        throw new Error(`${field.label}必须是有效的 http 或 https 链接`);
      }
      if (field.type === 'user') {
        fields[field.baseField] = toStringArray(value);
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
      await updateTrackingRecord(detail.recordId, {
        ...request,
        actorId,
        actorLarkId,
      });
      toast.success(`${stageConfig.label}已标记完成`);
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
        <RelatedEventsPanel
          detail={detail}
          canEdit={canEdit}
          actorId={actorId}
          actorLarkId={actorLarkId}
          onSelectEvent={onSelectEvent}
          onChanged={onRelatedEventsChanged || onSaved}
        />
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
              <AttachmentUploadField
                value={toAttachmentArray(formData[field.key])}
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

function toAttachmentArray(value: unknown): TrackingAttachment[] {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .map<TrackingAttachment | null>((item) => {
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        return {
          url: isPreviewableUrl(text) ? text : '',
          file_path: isPreviewableUrl(text) ? '' : text,
          name: text.split('/').pop() || text,
        };
      }
      if (!item || typeof item !== 'object') return null;
      const file = item as TrackingAttachment;
      return {
        ...file,
        bucket_id: textValue(file.bucket_id || file.bucketId),
        file_path: textValue(file.file_path || file.filePath),
        file_token: textValue(file.file_token || file.fileToken || file.token),
        url: textValue(file.url || file.download_url || file.downloadUrl || file.tmp_url || file.thumbnail_url || file.link),
        name: textValue(file.name || file.fileName),
      };
    })
    .filter((item): item is TrackingAttachment => Boolean(item));
}

function toAttachmentTextArray(value: unknown): string[] {
  return Array.from(
    new Set(
      toAttachmentArray(value)
        .map((file) =>
          textValue(file.url || file.download_url || file.downloadUrl || file.tmp_url || file.thumbnail_url || file.link) ||
          textValue(file.file_path || file.filePath) ||
          textValue(file.name || file.fileName),
        )
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function AttachmentUploadField({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: TrackingAttachment[];
  onChange: (value: TrackingAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<TrackingAttachment | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, { url: string; attempted: boolean }>>({});
  const [resolvingKeys, setResolvingKeys] = useState<Record<string, boolean>>({});
  const previewUrl = previewFile ? resolvedAttachmentUrl(previewFile, previewCache) : '';
  const previewName = previewFile ? attachmentName(previewFile, 0) : '';

  useEffect(() => {
    const unresolvedFiles = value
      .map((file) => ({
        file,
        key: attachmentPreviewKey(file),
      }))
      .filter(({ file, key }) => {
        if (!key || attachmentUrl(file)) return false;
        if (previewCache[key]?.attempted || resolvingKeys[key]) return false;
        return canResolveAttachmentPreview(file);
      })
      .slice(0, 6);

    if (!unresolvedFiles.length) return;

    setResolvingKeys((current) => ({
      ...current,
      ...Object.fromEntries(unresolvedFiles.map(({ key }) => [key, true])),
    }));

    Promise.all(
      unresolvedFiles.map(async ({ file, key }) => {
        const result = await resolveUiImagePreview({ attachment: file });
        return {
          key,
          url: result.url || '',
        };
      }),
    ).then((items) => {
      setPreviewCache((current) => ({
        ...current,
        ...Object.fromEntries(items.map((item) => [item.key, { url: item.url, attempted: true }])),
      }));
      setResolvingKeys((current) => {
        const next = { ...current };
        for (const item of items) delete next[item.key];
        return next;
      });
    });
  }, [value, previewCache, resolvingKeys]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selectedFiles.length) return;
    const invalidFile = selectedFiles.find((file) => !file.type.startsWith('image/'));
    if (invalidFile) {
      toast.error('UI图仅支持图片文件');
      return;
    }

    setUploading(true);
    try {
      const uploaded = await Promise.all(
        selectedFiles.map(async (file) => {
          const result = await uploadFile(file);
          return {
            bucket_id: result.bucketId,
            file_path: result.filePath,
            url: result.url || buildStorageObjectUrl(result.filePath, result.bucketId),
            name: file.name,
          } satisfies TrackingAttachment;
        }),
      );
      onChange([...value, ...uploaded]);
      toast.success(`已上传 ${uploaded.length} 张 UI 图`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="rounded-sm border border-input bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          accept="image/*"
          multiple
          disabled={disabled || uploading}
          onChange={handleFileChange}
          className="h-8 max-w-xs rounded-sm text-xs"
        />
        <span className="text-xs text-muted-foreground">
          {uploading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              上传中...
            </span>
          ) : (
            placeholder || '上传埋点事件对应的 UI 图'
          )}
        </span>
      </div>

      {value.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {value.map((file, index) => {
            const fileName = attachmentName(file, index);
            const key = attachmentPreviewKey(file);
            const url = resolvedAttachmentUrl(file, previewCache);
            const isResolving = Boolean(key && resolvingKeys[key]);
            return (
              <div
                key={`${key || file.file_path || file.url || fileName}-${index}`}
                className="flex items-center gap-2 rounded-sm border border-border bg-muted/30 px-2 py-1.5"
              >
                {url ? (
                  <button
                    type="button"
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-sm border border-border bg-background"
                    onClick={() => setPreviewFile(file)}
                    aria-label={`预览 ${fileName}`}
                  >
                    <img
                      src={url}
                      alt={fileName}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-background">
                    {isResolving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {url ? (
                    <button
                      type="button"
                      className="block max-w-full truncate text-left text-xs text-primary hover:underline"
                      onClick={() => setPreviewFile(file)}
                    >
                      {fileName}
                    </button>
                  ) : (
                    <span className="block truncate text-xs text-foreground">
                      {fileName}
                    </span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {url ? '点击预览 UI 图' : isResolving ? '正在解析预览链接...' : '暂无可预览链接'}
                  </span>
                </div>
                {url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 rounded-sm px-2 text-xs text-muted-foreground hover:text-primary"
                    onClick={() => setPreviewFile(file)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    预览
                  </Button>
                )}
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 rounded-sm p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeAt(index)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Upload className="h-3.5 w-3.5" />
          暂无 UI 图
        </div>
      )}

      <Dialog
        open={Boolean(previewFile)}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }}
      >
        <DialogContent className="max-w-5xl gap-0 overflow-hidden rounded-sm p-0">
          <DialogHeader className="border-b border-border px-4 py-3 pr-12">
            <DialogTitle className="truncate text-sm">{previewName || 'UI 图预览'}</DialogTitle>
            <DialogDescription className="text-xs">
              查看当前埋点事件关联的 UI 截图或原型图
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[72vh] overflow-auto bg-muted/30 p-4">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={previewName || 'UI 图预览'}
                className="mx-auto max-h-[68vh] max-w-full rounded-sm border border-border bg-background object-contain"
              />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center rounded-sm border border-dashed border-border bg-card text-xs text-muted-foreground">
                <ImageIcon className="mb-2 h-8 w-8" />
                该 UI 图暂无可预览链接
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border px-4 py-3">
            {previewUrl && (
              <Button asChild variant="outline" size="sm" className="rounded-sm">
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  新窗口打开
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function attachmentName(file: TrackingAttachment, index: number): string {
  return (
    textValue(file.name || file.fileName) ||
    textValue(file.file_path || file.filePath).split('/').pop() ||
    `UI图 ${index + 1}`
  );
}

function attachmentUrl(file: TrackingAttachment): string {
  const directUrl = textValue(file.url || file.download_url || file.downloadUrl || file.tmp_url || file.thumbnail_url || file.link).trim();
  if (directUrl) return directUrl;

  const filePath = textValue(file.file_path || file.filePath).trim();
  if (!filePath) return '';
  if (isPreviewableUrl(filePath)) return filePath;

  const bucketId = textValue(file.bucket_id || file.bucketId).trim() || getDefaultBucketId();
  return buildStorageObjectUrl(filePath, bucketId);
}

function resolvedAttachmentUrl(
  file: TrackingAttachment,
  previewCache: Record<string, { url: string; attempted: boolean }>,
): string {
  const directUrl = attachmentUrl(file);
  if (directUrl) return directUrl;
  const key = attachmentPreviewKey(file);
  return key ? previewCache[key]?.url || '' : '';
}

function canResolveAttachmentPreview(file: TrackingAttachment): boolean {
  return Boolean(
    textValue(file.file_path || file.filePath).trim() ||
    textValue(file.name || file.fileName).trim() ||
    textValue(file.file_token || file.fileToken || file.token).trim()
  );
}

function attachmentPreviewKey(file: TrackingAttachment): string {
  return [
    file.file_token,
    file.fileToken,
    file.token,
    file.url,
    file.download_url,
    file.downloadUrl,
    file.file_path,
    file.filePath,
    file.name,
    file.fileName,
  ]
    .map((value) => textValue(value).trim())
    .filter(Boolean)
    .join('|');
}

function buildStorageObjectUrl(filePath: string, bucketId?: string): string {
  const normalizedPath = filePath.trim().replace(/^\/+/, '');
  const normalizedBucketId = (bucketId || '').trim();
  const appId = getAppId();
  if (!appId || !normalizedBucketId || !normalizedPath) return '';
  return `/app/${appId}/runtime/api/v1/storage/object/${normalizedBucketId}/${encodeURIComponent(normalizedPath)}`;
}

function isPreviewableUrl(value: string): boolean {
  const text = value.trim();
  return (
    isHttpUrl(text) ||
    text.startsWith('/app/') ||
    text.startsWith('/spark/app/') ||
    text.startsWith('/runtime/api/v1/storage/object/') ||
    text.startsWith('/aily/api/v1/files/static/')
  );
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
