import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@client/src/components/ui/select';
import FormField from './FormField';
import {
  PARAM_TYPE_OPTIONS,
  REQUIRED_RULE_OPTIONS,
  APP_PLATFORM_OPTIONS,
  WEB_PLATFORM_OPTIONS,
} from './param-constants';
import type { ParamDetail, CreateParamRequest, TrackingSource } from '@shared/api.interface';

interface ParamFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  source: TrackingSource;
  defaultEvtId?: string;
  initialData?: ParamDetail | null;
  onClose: () => void;
  onSubmit: (data: CreateParamRequest) => Promise<void>;
}

const defaultForm = (evtId: string, source: TrackingSource): CreateParamRequest => ({
  evtId,
  paramName: '',
  paramType: 'STRING',
  required: false,
  requiredRule: '非必传',
  enumRange: '',
  definition: '',
  defaultValue: '',
  example: '',
  platform: source === 'web' ? 'Web通用' : 'App通用',
  status: '草稿',
  version: '',
  changeType: '新增',
});

const ParamFormDialog = ({
  open,
  mode,
  source,
  defaultEvtId = '',
  initialData,
  onClose,
  onSubmit,
}: ParamFormDialogProps) => {
  const [form, setForm] = useState<CreateParamRequest>(defaultForm(defaultEvtId, source));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialData) {
      setForm({
        evtId: initialData.evtId,
        paramName: initialData.paramName,
        paramType: initialData.paramType || 'STRING',
        required: initialData.required,
        requiredRule: initialData.requiredRule || (initialData.required ? '必传' : '非必传'),
        enumRange: initialData.enumRange,
        definition: initialData.definition,
        defaultValue: initialData.defaultValue,
        example: initialData.example,
        platform: normalizePlatformValue(initialData.platform, source),
        status: initialData.status || '草稿',
        version: initialData.version,
        changeType: initialData.changeType || '修改',
      });
    } else {
      setForm(defaultForm(defaultEvtId, source));
    }
  }, [open, mode, initialData, defaultEvtId, source]);

  const handleSubmit = async () => {
    if (!form.evtId.trim()) {
      toast.error('请先填写 evt_id');
      return;
    }
    if (!form.paramName.trim()) {
      toast.error('请输入参数名');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        required: form.requiredRule !== '非必传',
        paramKey: buildParamKey(form.evtId, form.paramName),
      });
      toast.success(mode === 'create' ? '新增参数成功' : '编辑参数成功');
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof CreateParamRequest>(
    key: K,
    value: CreateParamRequest[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectCls = 'h-8 rounded-sm text-xs w-full';
  const inputCls = 'h-8 rounded-sm text-xs';
  const textareaCls = 'rounded-sm text-xs min-h-[60px]';
  const platformOptions = source === 'web' ? WEB_PLATFORM_OPTIONS : APP_PLATFORM_OPTIONS;
  const autoParamKey = buildParamKey(form.evtId, form.paramName);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {mode === 'create' ? '新增参数' : '编辑参数'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
          <FormField label="参数 key（自动生成）">
            <div className="flex h-8 items-center rounded-sm border border-input bg-muted/30 px-3 font-mono text-xs text-muted-foreground">
              {autoParamKey || '填写 evt_id 和参数名后自动生成'}
            </div>
          </FormField>

          <FormField label="evt_id" required>
            <Input
              className={inputCls}
              value={form.evtId}
              onChange={(e) => updateField('evtId', e.target.value)}
            />
          </FormField>

          <FormField label="参数名" required>
            <Input
              className={inputCls}
              value={form.paramName}
              onChange={(e) => updateField('paramName', e.target.value)}
              placeholder="如：用户 ID"
            />
          </FormField>

          <FormField label="参数类型">
            <Select value={form.paramType} onValueChange={(v) => updateField('paramType', v)}>
              <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PARAM_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="必传规则">
            <Select
              value={form.requiredRule || (form.required ? '必传' : '非必传')}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  requiredRule: value,
                  required: value !== '非必传',
                }))
              }
            >
              <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {REQUIRED_RULE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option} className="text-xs">{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="适用端">
            <Select value={form.platform || ''} onValueChange={(v) => updateField('platform', v)}>
              <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {platformOptions.map((opt) => (
                  <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="版本">
            <Input
              className={inputCls}
              value={form.version || ''}
              onChange={(e) => updateField('version', e.target.value)}
              placeholder="如：v1.0.0"
            />
          </FormField>

          <FormField label="默认值">
            <Input
              className={inputCls}
              value={form.defaultValue || ''}
              onChange={(e) => updateField('defaultValue', e.target.value)}
            />
          </FormField>

          <FormField label="枚举范围（每行一个）" className="sm:col-span-2 lg:col-span-3">
            <Textarea
              className={textareaCls}
              value={form.enumRange || ''}
              onChange={(e) => updateField('enumRange', e.target.value)}
              placeholder="value1&#10;value2&#10;value3"
            />
          </FormField>

          <FormField label="定义" className="sm:col-span-2 lg:col-span-3">
            <Textarea
              className={textareaCls}
              value={form.definition || ''}
              onChange={(e) => updateField('definition', e.target.value)}
              placeholder="参数的详细定义说明..."
            />
          </FormField>

          <FormField label="示例" className="sm:col-span-2 lg:col-span-3">
            <Textarea
              className={textareaCls}
              value={form.example || ''}
              onChange={(e) => updateField('example', e.target.value)}
              placeholder="参数值示例..."
            />
          </FormField>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            size="sm"
            className="rounded-sm h-8"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </Button>
          <Button size="sm" className="rounded-sm h-8" onClick={handleSubmit} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? '保存中...' : '确定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ParamFormDialog;

function buildParamKey(evtId?: string, paramName?: string): string {
  const eventId = String(evtId || '').trim();
  const name = String(paramName || '').trim();
  return eventId && name ? `${eventId}.${name}` : '';
}

function normalizePlatformValue(value: string | undefined, source: TrackingSource): string {
  const raw = (value || '').trim();
  if (source === 'web') {
    if (raw === 'Web' || raw === '仅Web') return 'Web通用';
    return raw || 'Web通用';
  }
  const alias: Record<string, string> = {
    App: 'App通用',
    仅App: 'App通用',
    iOS: '仅iOS',
    Android: '仅Android',
    'iOS、Android': 'App通用',
    'iOS,Android': 'App通用',
    'iOS, Android': 'App通用',
  };
  return alias[raw] || raw || 'App通用';
}
