import { useState, useEffect } from 'react';
import { Save, Loader2, Upload, X, Image as ImageIcon } from 'lucide-react';
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
import { UserSelect } from '@client/src/components/business-ui/user-select';
import { uploadFile } from '@client/src/components/business-ui/api/files/service';
import { SIDEBAR_STAGES, type StageConfig } from './stage-config';
import { updateTrackingRecord } from '@client/src/api/tracking';
import type {
  TrackingAttachment,
  TrackingDetail,
  TrackingUserRef,
} from '@shared/api.interface';
import ParamDesigner from './param-designer/ParamDesigner';

interface StageFormProps {
  stageId: string;
  detail: TrackingDetail;
  canEdit: boolean;
  onSaved?: () => void;
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
  if (field.type === 'user') return toUserArray(val);
  if (field.type === 'attachment') return toAttachmentArray(val);
  if (val == null) return '';
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

const StageForm = ({ stageId, detail, canEdit, onSaved }: StageFormProps) => {
  const stageConfig: StageConfig | undefined = SIDEBAR_STAGES.find((s) => s.id === stageId);
  const [formData, setFormData] = useState<Record<string, FormValue>>({});
  const [saving, setSaving] = useState(false);

  // 初始化表单数据
  useEffect(() => {
    if (!stageConfig) return;
    const initial: Record<string, FormValue> = {};
    for (const field of stageConfig.fields) {
      initial[field.key] = getFieldValue(detail, field);
    }
    setFormData(initial);
  }, [stageConfig, detail]);

  if (!stageConfig) {
    return null;
  }

  const handleChange = (key: string, value: FormValue) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const fields: Record<string, unknown> = {};
      for (const field of stageConfig.fields) {
        const value = formData[field.key];
        // 只有值变化了才提交（简化处理：全部提交）
        if (field.type === 'user') {
          fields[field.baseField] = toStringArray(value);
        } else if (field.type === 'attachment') {
          fields[field.baseField] = toAttachmentArray(value);
        } else {
          fields[field.baseField] = toTextValue(value);
        }
      }

      await updateTrackingRecord(detail.recordId, { fields });
      toast.success('保存成功');
      onSaved?.();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '保存失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || saving;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-medium text-foreground">{stageConfig.label}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {canEdit ? '编辑以下字段，完成后点击保存' : '当前用户无编辑权限，字段为只读状态'}
        </p>
      </div>

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
                value={toUserArray(formData[field.key])}
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
          />
        </div>
      )}

      {/* 保存按钮 */}
      <div className="flex justify-end border-t border-border pt-4">
        <Button
          onClick={handleSave}
          disabled={disabled}
          size="sm"
          className="rounded-sm"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              保存
            </>
          )}
        </Button>
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

function toUserArray(value: unknown): TrackingUserRef[] {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .map<TrackingUserRef | null>((item) => {
      if (typeof item === 'string' || typeof item === 'number') {
        const id = extractNumericUserId(item);
        return id ? { user_id: id, name: id } : null;
      }
      if (item && typeof item === 'object') {
        const objectValue = item as Record<string, unknown>;
        const id = extractNumericUserId(objectValue);
        if (!id) return null;
        const larkUserId = [
          objectValue.larkUserId,
          objectValue.lark_user_id,
          objectValue.lark_id,
          objectValue.open_id,
          objectValue.openId,
        ].find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);
        const name = objectValue.name;
        return {
          user_id: id,
          larkUserId,
          name: typeof name === 'string' ? name : id,
        };
      }
      return null;
    })
    .filter((item): item is TrackingUserRef => Boolean(item));
}

function toAttachmentArray(value: unknown): TrackingAttachment[] {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .map<TrackingAttachment | null>((item) => {
      if (!item || typeof item !== 'object') return null;
      const file = item as TrackingAttachment;
      return {
        ...file,
        bucket_id: textValue(file.bucket_id || file.bucketId),
        file_path: textValue(file.file_path || file.filePath),
        url: textValue(file.url || file.download_url),
        name: textValue(file.name || file.fileName),
      };
    })
    .filter((item): item is TrackingAttachment => Boolean(item));
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
            url: result.url,
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
            const url = attachmentUrl(file);
            return (
              <div
                key={`${file.file_path || file.url || fileName}-${index}`}
                className="flex items-center gap-2 rounded-sm border border-border bg-muted/30 px-2 py-1.5"
              >
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-xs text-primary hover:underline"
                  >
                    {fileName}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {fileName}
                  </span>
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
  return textValue(file.url || file.download_url);
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
