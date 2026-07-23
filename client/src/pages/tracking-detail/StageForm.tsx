import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
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
import { SIDEBAR_STAGES, type StageConfig } from './stage-config';
import { updateTrackingRecord } from '@client/src/api/tracking';
import type { TrackingDetail } from '@shared/api.interface';

interface StageFormProps {
  stageId: string;
  detail: TrackingDetail;
  canEdit: boolean;
  onSaved?: () => void;
}

// 从 detail 中获取字段值（优先从 requirementFields 取，因为所有字段都存在那里）
function getFieldValue(detail: TrackingDetail, baseField: string): string {
  const val = detail.requirementFields?.[baseField];
  if (val == null) return '';
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
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // 初始化表单数据
  useEffect(() => {
    if (!stageConfig) return;
    const initial: Record<string, string> = {};
    for (const field of stageConfig.fields) {
      initial[field.key] = getFieldValue(detail, field.baseField);
    }
    setFormData(initial);
  }, [stageConfig, detail]);

  if (!stageConfig) {
    return null;
  }

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const fields: Record<string, unknown> = {};
      for (const field of stageConfig.fields) {
        const value = formData[field.key] || '';
        // 只有值变化了才提交（简化处理：全部提交）
        fields[field.baseField] = value;
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
          <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              {field.label}
            </Label>
            {field.type === 'input' && (
              <Input
                value={formData[field.key] || ''}
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
                value={formData[field.key] || ''}
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
                value={formData[field.key] || ''}
                onValueChange={(value: string) => handleChange(field.key, value)}
                disabled={disabled}
              >
                <SelectTrigger className="rounded-sm h-8 text-sm w-full">
                  <SelectValue placeholder={`请选择${field.label}`} />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>

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

export default StageForm;
