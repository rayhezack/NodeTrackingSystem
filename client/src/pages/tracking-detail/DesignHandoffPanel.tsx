import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ClipboardList, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { logger } from '@client/src/lib/logger';
import { toast } from 'sonner';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { getParams, getTrackingDetail, resolveUiImagePreview } from '@client/src/api/tracking';
import type { ParamDetail, TrackingDetail } from '@shared/api.interface';
import ParamSpecTable from './param-designer/ParamSpecTable';
import { buildDevelopmentContext, loadDevelopmentContext } from './development-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@client/src/components/ui/dialog';
import { Textarea } from '@client/src/components/ui/textarea';
import UiImageField from './UiImageField';
import {
  getHandoffEvents,
  getDesignBaseLinks,
  getHandoffPresentation,
  handoffTextValue,
  type HandoffEvent,
} from './design-handoff.utils';

interface DesignHandoffPanelProps {
  detail: TrackingDetail;
  actorId?: string;
  actorLarkId?: string;
}

const DesignHandoffPanel = ({ detail, actorId, actorLarkId }: DesignHandoffPanelProps) => {
  const [copying, setCopying] = useState(false);
  const copyBusy = useRef(false);
  const [copyProgress, setCopyProgress] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const events = useMemo(() => getHandoffEvents(detail), [detail]);
  const [selectedRecordId, setSelectedRecordId] = useState(detail.recordId);
  const [items, setItems] = useState<ParamDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const paramsRequestId = useRef(0);
  const selectedEvent = events.find((event) => event.recordId === selectedRecordId) || events[0];
  const selectedDetail = selectedEvent?.detail;
  const selectedEventRecordId = selectedEvent?.recordId;
  const baseLinks = getDesignBaseLinks(selectedEvent?.source || detail.source);

  useEffect(() => {
    if (selectedEvent && selectedEvent.recordId !== selectedRecordId) {
      setSelectedRecordId(selectedEvent.recordId);
    }
  }, [selectedEvent, selectedRecordId]);

  const loadParams = useCallback(async () => {
    if (!selectedEventRecordId) return;
    const requestId = ++paramsRequestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await getParams(selectedEventRecordId);
      if (requestId !== paramsRequestId.current) return;
      setItems(res.items || []);
    } catch (err) {
      if (requestId !== paramsRequestId.current) return;
      const msg = err instanceof Error ? err.message : '加载失败';
      setError(msg);
      logger.error('加载研发对接参数失败', err);
    } finally {
      if (requestId === paramsRequestId.current) {
        setLoading(false);
      }
    }
  }, [selectedEventRecordId]);

  useEffect(() => {
    loadParams();
  }, [loadParams]);

  const presentation = useMemo(
    () => selectedDetail
      ? getHandoffPresentation(selectedDetail)
      : { summaryItems: [], uiImages: [], uiPageUrl: '' },
    [selectedDetail],
  );

  const handleCopy = async () => {
    if (copyBusy.current) return;
    copyBusy.current = true;
    setCopying(true);
    setCopyProgress('读取整份需求…');
    try {
      const context = await loadDevelopmentContext(detail.recordId, {
        detail: async (id) => (await getTrackingDetail(id, actorId, actorLarkId)).data,
        params: (id) => getParams(id, true),
        preview: async (attachment) => (await resolveUiImagePreview({ attachment })).url,
      }, (done, total) => setCopyProgress(`整理事件 ${done}/${total}…`));
      const text = buildDevelopmentContext(context.detail, context.events);
      try {
        await copyText(text);
        toast.success(`已复制整份需求：${context.events.length} 个事件、${context.events.reduce((sum, event) => sum + event.params.length, 0)} 条参数`);
      } catch {
        setCopyFallback(text);
        toast.info('完整内容已生成，请点击复制或全选复制');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '读取整份需求失败，请重试');
    } finally {
      copyBusy.current = false;
      setCopying(false);
    }
  };

  return (
    <div className="space-y-4 border-y border-border/60 bg-muted/20 px-3 py-4 sm:px-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">研发对接速览</h3>
            <Badge variant="outline" className="h-5 rounded-full px-1.5 text-xs font-normal">
              {events.length} 个事件
            </Badge>
            <Badge variant="outline" className="h-5 rounded-full px-1.5 text-xs font-normal">
              当前事件 {items.length} 个参数
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full"
          onClick={handleCopy}
          disabled={copying}
        >
          {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          {copying ? copyProgress : '复制整份开发说明'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-y border-border/60 py-3">
        <Button asChild variant="outline" size="sm" className="h-8 rounded-full">
          <a href={baseLinks.design} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            打开埋点设计表
          </a>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 rounded-full">
          <a href={baseLinks.params} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            打开设计参数表
          </a>
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          按 evt_id「{selectedEvent?.evtId || '未填写'}」查找；需有飞书 Base 访问权限。
        </p>
      </div>

      <Dialog open={Boolean(copyFallback)} onOpenChange={(open) => !open && setCopyFallback('')}>
        <DialogContent className="max-w-4xl rounded-lg">
          <DialogHeader>
            <DialogTitle>整份需求开发上下文</DialogTitle>
            <DialogDescription>浏览器未允许自动复制。可点击下方按钮，或全选文本后复制。</DialogDescription>
          </DialogHeader>
          <Textarea aria-label="整份需求开发上下文" readOnly value={copyFallback} className="h-[55vh] font-mono text-xs" />
          <Button onClick={() => copyText(copyFallback).then(() => toast.success('整份需求已复制')).catch(() => toast.error('请在文本框中全选后复制'))}>
            <Copy className="h-3.5 w-3.5" />复制全部内容
          </Button>
        </DialogContent>
      </Dialog>

      {events.length > 1 && (
        <div className="border-y border-border/60 bg-card/70 py-3">
          <div className="mb-2 text-xs font-medium text-foreground">同需求埋点事件</div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <EventSelector
                key={event.recordId}
                event={event}
                selected={event.recordId === selectedEvent?.recordId}
                onClick={() => setSelectedRecordId(event.recordId)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-x-4 gap-y-3 border-y border-border/60 py-3 md:grid-cols-4">
        {presentation.summaryItems.map((item) => (
          <SummaryCell key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <div className="grid gap-4 border-b border-border/60 pb-4 md:grid-cols-3">
        <LongSpec label="事件定义" value={handoffTextValue(selectedDetail?.designFields['事件定义'])} />
        <LongSpec label="触发时机" value={handoffTextValue(selectedDetail?.designFields['触发时机'])} />
        <LongSpec label="本次需求补充说明" value={handoffTextValue(selectedDetail?.designFields['本次需求补充说明'])} />
        <LongSpec label="公共属性要求" value={handoffTextValue(selectedDetail?.designFields['公共属性要求'])} />
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
          UI 图
          <Badge variant="outline" className="h-5 rounded-full px-1.5 text-xs font-normal">
            {presentation.uiImages.length} 张
          </Badge>
        </div>
        <UiImageField
          value={presentation.uiImages}
          source={selectedDetail?.source || detail.source}
          pageUrl={presentation.uiPageUrl}
          readOnly
        />
      </div>

      {loading ? (
        <div className="border-y border-border/60 bg-card/70">
          <div className="flex h-20 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在加载参数说明...
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-between border-y border-border/60 bg-card/70 px-3 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-destructive" />
            参数说明加载失败：{error}
          </div>
          <Button variant="outline" size="sm" className="h-7 rounded-full" onClick={loadParams}>
            重试
          </Button>
        </div>
      ) : items.length ? (
        <ParamSpecTable items={items} source={selectedDetail?.source || detail.source} />
      ) : (
        <div className="border-y border-dashed border-border/70 bg-card/70 py-8 text-center text-xs text-muted-foreground">
          暂无参数说明，请先在埋点设计阶段补充参数。
        </div>
      )}
    </div>
  );
};

export default DesignHandoffPanel;

function EventSelector({
  event,
  selected,
  onClick,
}: {
  event: HandoffEvent;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
        className={`min-w-0 rounded-md border px-3 py-2 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-background text-foreground hover:bg-accent'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-all font-mono text-xs font-medium">
          {event.evtId || '待填写 evt_id'}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatPlatform(event.platform)}
        </span>
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">
        {event.eventName || '未命名事件'}
      </div>
    </button>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-primary/30 bg-card/60 px-3 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-xs text-foreground">{value}</div>
    </div>
  );
}

function LongSpec({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-border bg-card/60 px-3 py-1.5">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
        {value || <span className="text-muted-foreground">未填写</span>}
      </div>
    </div>
  );
}

function formatPlatform(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '未指定端';
  if (normalized === 'Web') return 'Web（前端）';
  if (normalized === 'App') return 'App';
  return normalized;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally {
    document.body.removeChild(textarea);
  }
}
