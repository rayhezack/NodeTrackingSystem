import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  GitBranch,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Undo2,
  LockKeyhole,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
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
import {
  createSiblingTrackingEvent,
  deleteTrackingEvent,
} from '@client/src/api/tracking';
import type {
  CreateSiblingTrackingEventRequest,
  ReuseOfficialEventResponse,
  RelatedTrackingEvent,
  TrackingDetail,
} from '@shared/api.interface';
import ReuseOfficialEventDialog from './ReuseOfficialEventDialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  eventDeletionRestriction,
  filterEvents,
} from './event-navigation.utils';
import './event-navigation.css';

interface RelatedEventsPanelProps {
  detail: TrackingDetail;
  canEdit: boolean;
  onDeletionBusyChange?: (busy: boolean) => void;
  actorId?: string;
  actorLarkId?: string;
  onSelectEvent?: (recordId: string) => void;
  onChanged?: (recordId?: string) => void | Promise<void>;
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
  onSelectEvent,
  onDeletionBusyChange,
  onChanged,
}: RelatedEventsPanelProps) {
  const [open, setOpen] = useState(false);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingDeleteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    committing: boolean;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef(detail);
  detailRef.current = detail;
  const reduceMotion = useReducedMotion();
  const [hiddenEventIds, setHiddenEventIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [form, setForm] = useState<EventForm>(() => defaultForm(detail));
  const events = detail.relatedEvents?.length
    ? detail.relatedEvents
    : [
        {
          recordId: detail.recordId,
          source: detail.source,
          evtId: detail.evtId,
          eventName: detail.eventName,
          stage: detail.stage,
          uiStage: detail.uiStage,
          priority: detail.priority,
          platform: detail.platform,
          isCurrent: true,
        },
      ];

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
      await onChanged?.(res.recordId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '新增事件失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReuseSuccess = async (result: ReuseOfficialEventResponse) => {
    await onChanged?.(result.recordId);
  };

  useEffect(() => {
    onDeletionBusyChange?.(Boolean(pendingDelete));
  }, [pendingDelete, onDeletionBusyChange]);

  useEffect(
    () => () => {
      // Leaving this workspace cancels an uncommitted deletion; never write from a stale timer.
      if (pendingDeleteRef.current) clearTimeout(pendingDeleteRef.current);
    },
    [],
  );

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(
      '[aria-current="true"]',
    );
    if (row && listRef.current)
      listRef.current.scrollTop = row.offsetTop - listRef.current.offsetTop;
  }, [detail.recordId]);

  const commitDelete = async (event: RelatedTrackingEvent) => {
    pendingDeleteRef.current = null;
    setPendingDelete({ id: event.recordId, committing: true });
    try {
      const result = await deleteTrackingEvent(event.recordId, {
        actorId,
        actorLarkId,
      });
      setHiddenEventIds((current) => new Set(current).add(event.recordId));
      setPendingDelete(null);
      toast.success('事件及其设计参数已删除');
      const selectedId = detailRef.current.recordId;
      await onChanged?.(
        event.recordId === selectedId ? result.redirectRecordId : selectedId,
      );
    } catch (error) {
      setPendingDelete(null);
      toast.error(
        error instanceof Error ? error.message : '删除失败，事件已保留，请重试',
      );
    }
  };

  const undoDelete = () => {
    if (pendingDeleteRef.current) clearTimeout(pendingDeleteRef.current);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
  };

  const handleDeleteEvent = (event: RelatedTrackingEvent) => {
    if (
      pendingDelete ||
      eventDeletionRestriction(
        event,
        events.length - hiddenEventIds.size,
        canEdit,
      )
    )
      return;
    setPendingDelete({ id: event.recordId, committing: false });
    pendingDeleteRef.current = setTimeout(() => void commitDelete(event), 5000);
  };

  const remainingEvents = events.filter(
    (event) => !hiddenEventIds.has(event.recordId),
  );
  const visibleEvents = filterEvents(remainingEvents, query);

  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-card p-3 xl:sticky xl:top-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <GitBranch aria-hidden="true" className="h-4 w-4 text-primary" />
          同需求事件{' '}
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {remainingEvents.length}
          </span>
        </h3>
        <button
          type="button"
          aria-label={expanded ? '收起事件列表' : '展开事件列表'}
          aria-expanded={expanded}
          aria-controls="request-event-navigation"
          onClick={() => setExpanded((value) => !value)}
          className="rounded-md p-2 focus-visible:ring-2 focus-visible:ring-primary xl:hidden"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
        {canEdit && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              disabled={Boolean(pendingDelete)}
              onClick={() => setReuseOpen(true)}
            >
              <GitBranch className="h-3.5 w-3.5" />
              复用
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              disabled={Boolean(pendingDelete)}
              onClick={() => setOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              新增
            </Button>
          </div>
        )}
      </div>
      <div
        id="request-event-navigation"
        className={expanded || pendingDelete ? '' : 'hidden xl:block'}
      >
        <div className="relative my-3">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
          />
          <Input
            aria-label="搜索同需求事件"
            placeholder="搜索事件"
            value={query}
            disabled={Boolean(pendingDelete)}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <div
          ref={listRef}
          aria-label="同需求事件列表"
          className="relative max-h-56 space-y-1 overflow-y-auto overscroll-contain xl:max-h-[min(60vh,40rem)]"
        >
          <AnimatePresence initial={false}>
            {visibleEvents.map((event) => {
              const restriction = eventDeletionRestriction(
                event,
                remainingEvents.length,
                canEdit,
              );
              const deleting = pendingDelete?.id === event.recordId;
              return (
                <motion.div
                  key={event.recordId}
                  layout={!reduceMotion}
                  exit={{
                    opacity: 0,
                    height: 0,
                    minHeight: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                  transition={{ duration: reduceMotion ? 0 : 0.18 }}
                  className={`group flex min-h-16 min-w-0 items-center gap-1 rounded-lg px-2 py-2 ${deleting ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary/20' : event.isCurrent ? 'bg-primary/10 text-primary' : 'hover:bg-muted/70'}`}
                >
                  {deleting ? (
                    <div
                      className="flex min-w-0 flex-1 items-center gap-2"
                      role="status"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs" title={event.evtId}>
                          {event.evtId || event.eventName}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {pendingDelete.committing
                            ? '正在删除…'
                            : '5 秒后删除事件及参数'}
                        </div>
                      </div>
                      {pendingDelete.committing ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <Button
                          autoFocus
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 border-primary/20 bg-card px-2 text-primary hover:bg-primary/10 hover:text-primary"
                          onClick={undoDelete}
                          aria-label={`撤销删除${event.evtId || event.eventName}`}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          撤销
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-current={event.isCurrent ? 'true' : undefined}
                        title={event.evtId || event.eventName}
                        onClick={() => {
                          if (!event.isCurrent) onSelectEvent?.(event.recordId);
                          setExpanded(false);
                        }}
                        className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <div className="truncate font-mono text-xs font-medium">
                          {event.evtId || '待填写 evt_id'}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {event.eventName || '未命名事件'}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {event.uiStage || event.stage || '-'}
                        </div>
                      </button>
                      {restriction ? (
                        <span
                          tabIndex={0}
                          title={restriction}
                          aria-label={restriction}
                          className="rounded p-2 text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <LockKeyhole
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(pendingDelete)}
                          className="event-row-delete shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                          onClick={() => handleDeleteEvent(event)}
                          title="删除该设计事件"
                          aria-label={`删除${event.evtId || event.eventName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          {!visibleEvents.length && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              没有匹配的事件
            </p>
          )}
        </div>
      </div>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => !nextOpen && !saving && setOpen(false)}
      >
        <DialogContent className="max-w-3xl rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-base">新增同需求埋点事件</DialogTitle>
          </DialogHeader>

          <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            沿用当前需求的背景、链接和参与人。
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            <Field label="evt_id">
              <Input
                className="h-8 rounded-md text-xs"
                value={form.evtId}
                onChange={(event) => updateField('evtId', event.target.value)}
                placeholder="如：video_play_click，可稍后填写"
                disabled={saving}
              />
            </Field>
            <Field label="事件名" required>
              <Input
                className="h-8 rounded-md text-xs"
                value={form.eventName}
                onChange={(event) =>
                  updateField('eventName', event.target.value)
                }
                placeholder="如：视频播放按钮点击"
                disabled={saving}
              />
            </Field>
            <Field label="优先级">
              <Select
                value={form.priority}
                onValueChange={(value) => updateField('priority', value)}
                disabled={saving}
              >
                <SelectTrigger className="h-8 rounded-md text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['P0', 'P1', 'P2'].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="端">
              <Select
                value={form.platform}
                onValueChange={(value) => updateField('platform', value)}
                disabled={saving}
              >
                <SelectTrigger className="h-8 rounded-md text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(detail.source === 'web'
                    ? ['Web']
                    : ['iOS', 'Android', 'iOS、Android']
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="版本">
              <Input
                className="h-8 rounded-md text-xs"
                value={form.version}
                onChange={(event) => updateField('version', event.target.value)}
                placeholder="如：1.0.0"
                disabled={saving}
              />
            </Field>
            <Field label="最低版本">
              <Input
                className="h-8 rounded-md text-xs"
                value={form.minVersion}
                onChange={(event) =>
                  updateField('minVersion', event.target.value)
                }
                placeholder="如：1.0.0"
                disabled={saving}
              />
            </Field>
            <Field label="事件定义" className="md:col-span-2">
              <Textarea
                className="min-h-[72px] rounded-md text-xs"
                value={form.eventDefinition}
                onChange={(event) =>
                  updateField('eventDefinition', event.target.value)
                }
                placeholder="定义事件统计口径和边界..."
                disabled={saving}
              />
            </Field>
            <Field label="触发时机" className="md:col-span-2">
              <Textarea
                className="min-h-[72px] rounded-md text-xs"
                value={form.triggerTiming}
                onChange={(event) =>
                  updateField('triggerTiming', event.target.value)
                }
                placeholder="描述事件触发的具体时机..."
                disabled={saving}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-full"
              onClick={handleCreate}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
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
    platform:
      detail.source === 'web' ? 'Web' : normalizeAppPlatform(detail.platform),
    eventDefinition: '',
    triggerTiming: '',
    version: textValue(detail.designFields['版本']) || '1.0.0',
    minVersion:
      textValue(detail.designFields['最低版本']) ||
      textValue(detail.designFields['版本']) ||
      '1.0.0',
  };
}

function normalizeAppPlatform(platform: string): string {
  if (platform.includes('iOS') && platform.includes('Android'))
    return 'iOS、Android';
  if (platform.includes('iOS')) return 'iOS';
  if (platform.includes('Android')) return 'Android';
  return 'iOS、Android';
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value))
    return value.map(textValue).filter(Boolean).join('、');
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
