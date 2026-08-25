import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ClipboardList, Copy, Loader2 } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { getParams } from '@client/src/api/tracking';
import type { ParamDetail, TrackingDetail, TrackingDetailSnapshot } from '@shared/api.interface';
import ParamSpecTable from './param-designer/ParamSpecTable';
import { buildParamClipboardText } from './param-designer/param-display.utils';
import { getHandoffEvents, type HandoffEvent } from './design-handoff.utils';

interface DesignHandoffPanelProps {
  detail: TrackingDetail;
}

const DESIGN_SUMMARY_FIELDS = [
  { key: 'evt_id', label: 'evt_id' },
  { key: '事件中文名', label: '事件名' },
  { key: '端', label: '适用端' },
  { key: '处理方', label: '处理方' },
  { key: '版本', label: '版本' },
  { key: '最低版本', label: '最低版本' },
  { key: '变更类型', label: '变更类型' },
] as const;

const DesignHandoffPanel = ({ detail }: DesignHandoffPanelProps) => {
  const events = useMemo(() => getHandoffEvents(detail), [detail]);
  const [selectedRecordId, setSelectedRecordId] = useState(detail.recordId);
  const [items, setItems] = useState<ParamDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const paramsRequestId = useRef(0);
  const selectedEvent = events.find((event) => event.recordId === selectedRecordId) || events[0];
  const selectedDetail = selectedEvent?.detail;
  const selectedEventRecordId = selectedEvent?.recordId;

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

  const summaryItems = useMemo(() => {
    const fields = selectedDetail?.designFields || {};
    return DESIGN_SUMMARY_FIELDS.map((field) => ({
      label: field.label,
      value:
        field.key === 'evt_id'
          ? selectedDetail?.evtId || selectedEvent?.evtId || textValue(fields[field.key])
          : field.key === '事件中文名'
            ? selectedDetail?.eventName || selectedEvent?.eventName || textValue(fields[field.key])
            : textValue(fields[field.key]),
    })).filter((item) => item.value);
  }, [selectedDetail, selectedEvent]);

  const handleCopy = async () => {
    try {
      if (!selectedDetail) return;
      await copyText(buildDesignHandoffText(selectedDetail, items));
      toast.success('研发对接说明已复制');
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  };

  return (
    <div className="rounded-sm border border-border bg-muted/20 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">研发对接速览</h3>
            <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px] font-normal">
              {events.length} 个事件
            </Badge>
            <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px] font-normal">
              {items.length} 个参数
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            只读展示埋点设计口径，开发可直接查阅事件定义、触发时机、参数含义、枚举值和示例。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-sm"
          onClick={handleCopy}
          disabled={loading}
        >
          <Copy className="h-3.5 w-3.5" />
          复制开发说明
        </Button>
      </div>

      {events.length > 1 && (
        <div className="mb-4 rounded-sm border border-border bg-card p-3">
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

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {summaryItems.map((item) => (
          <SummaryCell key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <LongSpec label="事件定义" value={textValue(selectedDetail?.designFields['事件定义'])} />
        <LongSpec label="触发时机" value={textValue(selectedDetail?.designFields['触发时机'])} />
        <LongSpec label="公共属性要求" value={textValue(selectedDetail?.designFields['公共属性要求'])} />
      </div>

      {loading ? (
        <div className="rounded-sm border border-border bg-card">
          <div className="flex h-20 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在加载参数说明...
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-between rounded-sm border border-border bg-card px-3 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-destructive" />
            参数说明加载失败：{error}
          </div>
          <Button variant="outline" size="sm" className="h-7 rounded-sm" onClick={loadParams}>
            重试
          </Button>
        </div>
      ) : items.length ? (
        <ParamSpecTable items={items} source={detail.source} />
      ) : (
        <div className="rounded-sm border border-dashed border-border bg-card py-8 text-center text-xs text-muted-foreground">
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
      className={`min-w-0 rounded-sm border px-3 py-2 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-background text-foreground hover:bg-accent'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-all font-mono text-xs font-medium">
          {event.evtId || '待填写 evt_id'}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
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
    <div className="rounded-sm border border-border bg-card px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-xs text-foreground">{value}</div>
    </div>
  );
}

function LongSpec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-card px-3 py-2">
      <div className="mb-1 text-[10px] text-muted-foreground">{label}</div>
      <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
        {value || <span className="text-muted-foreground">未填写</span>}
      </div>
    </div>
  );
}

function buildDesignHandoffText(detail: TrackingDetail | TrackingDetailSnapshot, params: ParamDetail[]): string {
  const lines = [
    `埋点开发说明：${detail.evtId || '-'}`,
    `事件名：${detail.eventName || '-'}`,
    `端：${textValue(detail.designFields['端']) || detail.platform || '-'}`,
    `处理方：${textValue(detail.designFields['处理方']) || '-'}`,
    `版本：${textValue(detail.designFields['版本']) || '-'}`,
    `最低版本：${textValue(detail.designFields['最低版本']) || '-'}`,
    `变更类型：${textValue(detail.designFields['变更类型']) || '-'}`,
    '',
    `事件定义：${textValue(detail.designFields['事件定义']) || '-'}`,
    `触发时机：${textValue(detail.designFields['触发时机']) || '-'}`,
    `公共属性要求：${textValue(detail.designFields['公共属性要求']) || '-'}`,
    '',
    buildParamClipboardText(params, detail.source, '参数说明'),
  ];
  return lines.join('\n');
}

function formatPlatform(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '未指定端';
  if (normalized === 'Web') return 'Web（前端）';
  if (normalized === 'App') return 'App';
  return normalized;
}

function textValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textValue).filter(Boolean).join('、');
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return textValue(
      objectValue.text ||
      objectValue.name ||
      objectValue.link ||
      objectValue.url ||
      objectValue.id,
    );
  }
  return '';
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
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
