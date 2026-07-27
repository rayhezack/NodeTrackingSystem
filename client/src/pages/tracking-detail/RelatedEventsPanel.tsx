import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Loader2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { createSiblingTrackingEvent } from '@client/src/api/tracking';
import type {
  CreateSiblingTrackingEventRequest,
  ReuseOfficialEventResponse,
  TrackingDetail,
} from '@shared/api.interface';
import ReuseOfficialEventDialog from './ReuseOfficialEventDialog';

interface RelatedEventsPanelProps {
  detail: TrackingDetail;
  canEdit: boolean;
  actorId?: string;
  actorLarkId?: string;
  onChanged?: () => void | Promise<void>;
}

type EventForm = {
  evtId: string;
  eventName: string;
  priority: string;
  platform: string;
  eventDefinition: string;
  triggerTiming: string;
  version: string;
  minVersion: string;
};

export default function RelatedEventsPanel({
  detail,
  canEdit,
  actorId,
  actorLarkId,
  onChanged,
}: RelatedEventsPanelProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EventForm>(() => defaultForm(detail));
  const events = detail.relatedEvents?.length
    ? detail.relatedEvents
    : [{
        recordId: detail.recordId,
        source: detail.source,
        evtId: detail.evtId,
        eventName: detail.eventName,
        stage: detail.stage,
        uiStage: detail.uiStage,
        priority: detail.priority,
        platform: detail.platform,
        isCurrent: true,
      }];

  useEffect(() => {
    if (open) {
      setForm(defaultForm(detail));
    }
  }, [open, detail]);

  const updateField = (key: keyof EventForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    if (!form.eventName.trim()) {
      toast.error('请输入事件名');
      return;
    }
    setSaving(true);
    try {
      const payload: CreateSiblingTrackingEventRequest = {
        evtId: form.evtId.trim(),
        eventName: form.eventName.trim(),
        priority: form.priority,
        platform: form.platform,
        eventDefinition: form.eventDefinition.trim(),
        triggerTiming: form.triggerTiming.trim(),
        version: form.version.trim(),
        minVersion: form.minVersion.trim(),
        actorId,
        actorLarkId,
      };
      const res = await createSiblingTrackingEvent(detail.recordId, payload);
      toast.success('已新增同需求埋点事件');
      setOpen(false);
      navigate(`/tracking/${res.recordId}?stage=design`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '新增事件失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReuseSuccess = async (result: ReuseOfficialEventResponse) => {
    if (result.recordId === detail.recordId) {
      await onChanged?.();
      return;
    }
    navigate(`/tracking/${result.recordId}?stage=design`);
  };

  return (
    <div className="rounded-sm border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <GitBranch className="h-4 w-4 text-primary" />
            同需求埋点事件
            <span className="text-xs font-normal text-muted-foreground">
              共 {events.length} 个
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            一个需求可包含多个埋点事件；新增事件会复用当前需求ID、需求背景和项目参与人。
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-sm"
              onClick={() => setReuseOpen(true)}
            >
              <GitBranch className="h-3.5 w-3.5" />
              复用已有事件
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-sm"
              onClick={() => setOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              新增事件
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {events.map((event) => (
          <button
            key={event.recordId}
            type="button"
            onClick={() => !event.isCurrent && navigate(`/tracking/${event.recordId}?stage=design`)}
            className={`max-w-full rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
              event.isCurrent
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-foreground hover:bg-accent'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">
                {event.evtId || '待填写 evt_id'}
              </span>
              <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                {event.uiStage || event.stage || '-'}
              </Badge>
            </div>
            <div className="mt-1 max-w-[280px] truncate text-muted-foreground">
              {event.eventName || '未命名事件'}
            </div>
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !saving && setOpen(false)}>
        <DialogContent className="max-w-3xl rounded-sm">
          <DialogHeader>
            <DialogTitle className="text-base">新增同需求埋点事件</DialogTitle>
          </DialogHeader>

          <div className="rounded-sm border border-[hsl(217_91%_86%)] bg-[hsl(217_91%_97%)] px-3 py-2 text-xs text-muted-foreground">
            该事件会归入当前需求，自动复用需求ID、需求背景、需求链接和项目参与人；这里只填写事件级设计信息。
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            <Field label="evt_id">
              <Input
                className="h-8 rounded-sm text-xs"
                value={form.evtId}
                onChange={(event) => updateField('evtId', event.target.value)}
                placeholder="如：video_play_click，可稍后填写"
                disabled={saving}
              />
            </Field>
            <Field label="事件名" required>
              <Input
                className="h-8 rounded-sm text-xs"
                value={form.eventName}
                onChange={(event) => updateField('eventName', event.target.value)}
                placeholder="如：视频播放按钮点击"
                disabled={saving}
              />
            </Field>
            <Field label="优先级">
              <Select value={form.priority} onValueChange={(value) => updateField('priority', value)} disabled={saving}>
                <SelectTrigger className="h-8 rounded-sm text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['P0', 'P1', 'P2'].map((value) => (
                    <SelectItem key={value} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="端">
              <Select value={form.platform} onValueChange={(value) => updateField('platform', value)} disabled={saving}>
                <SelectTrigger className="h-8 rounded-sm text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(detail.source === 'web' ? ['Web'] : ['iOS', 'Android', 'iOS、Android']).map((value) => (
                    <SelectItem key={value} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="版本">
              <Input
                className="h-8 rounded-sm text-xs"
                value={form.version}
                onChange={(event) => updateField('version', event.target.value)}
                placeholder="如：1.0.0"
                disabled={saving}
              />
            </Field>
            <Field label="最低版本">
              <Input
                className="h-8 rounded-sm text-xs"
                value={form.minVersion}
                onChange={(event) => updateField('minVersion', event.target.value)}
                placeholder="如：1.0.0"
                disabled={saving}
              />
            </Field>
            <Field label="事件定义" className="md:col-span-2">
              <Textarea
                className="min-h-[72px] rounded-sm text-xs"
                value={form.eventDefinition}
                onChange={(event) => updateField('eventDefinition', event.target.value)}
                placeholder="定义事件统计口径和边界..."
                disabled={saving}
              />
            </Field>
            <Field label="触发时机" className="md:col-span-2">
              <Textarea
                className="min-h-[72px] rounded-sm text-xs"
                value={form.triggerTiming}
                onChange={(event) => updateField('triggerTiming', event.target.value)}
                placeholder="描述事件触发的具体时机..."
                disabled={saving}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button size="sm" className="h-8 rounded-sm" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? '创建中...' : '创建事件'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReuseOfficialEventDialog
        open={reuseOpen}
        detail={detail}
        actorId={actorId}
        actorLarkId={actorLarkId}
        onClose={() => setReuseOpen(false)}
        onReused={handleReuseSuccess}
      />
    </div>
  );
}

function defaultForm(detail: TrackingDetail): EventForm {
  return {
    evtId: '',
    eventName: '',
    priority: detail.priority || 'P2',
    platform: detail.source === 'web' ? 'Web' : normalizeAppPlatform(detail.platform),
    eventDefinition: '',
    triggerTiming: '',
    version: textValue(detail.designFields['版本']) || '1.0.0',
    minVersion: textValue(detail.designFields['最低版本']) || textValue(detail.designFields['版本']) || '1.0.0',
  };
}

function normalizeAppPlatform(platform: string): string {
  if (platform.includes('iOS') && platform.includes('Android')) return 'iOS、Android';
  if (platform.includes('iOS')) return 'iOS';
  if (platform.includes('Android')) return 'Android';
  return 'iOS、Android';
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join('、');
  return '';
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <div className="mb-1.5 text-xs text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </div>
      {children}
    </label>
  );
}
