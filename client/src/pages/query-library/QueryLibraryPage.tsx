import { LiquidToggle } from '@client/src/components/bencho/LiquidToggle';
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ClipboardCopy, Database, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@client/src/lib/logger";
import { Button } from "@client/src/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@client/src/components/ui/select";
import { getOfficialEvents, getOfficialParams } from "@client/src/api/query-library";
import type { OfficialEvent, OfficialParam, TrackingSource } from "@shared/api.interface";
import { SeekSearch } from "./SeekSearch";
import { RadialMenu } from "./RadialMenu";
import { ParamDetailPanel } from "./ParamDetailPanel";

interface ParamState {
  loading: boolean;
  error: string | null;
  items: OfficialParam[];
  total: number;
  baseLink?: string;
}

function statusClass(status: string) {
  if (status.includes("上线") || status.includes("稳定")) return "bg-[var(--status-success-bg)] text-success";
  if (status.includes("废弃") || status.includes("下线")) return "bg-[var(--status-error-bg)] text-destructive";
  return "bg-[var(--status-warning-bg)] text-foreground";
}

export default function QueryLibraryPage() {
  const [source, setSource] = useState<TrackingSource>("web");
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [events, setEvents] = useState<OfficialEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageToken, setPageToken] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState<ParamState>({ loading: false, error: null, items: [], total: 0 });
  const [paramKeyword, setParamKeyword] = useState("");
  const request = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const selected = events.find((event) => event.recordId === selectedId) || null;

  const fetchEvents = useCallback(async (token?: string) => {
    const append = Boolean(token);
    const current = ++request.current;
    if (append) setLoadingMore(true);
    else { setLoading(true); setError(null); setEvents([]); setSelectedId(null); setParams({ loading: false, error: null, items: [], total: 0 }); }
    try {
      const response = await getOfficialEvents({ source, keyword: keyword || undefined, category: category || undefined, pageSize: 30, pageToken: token });
      if (current !== request.current) return;
      setEvents((previous) => append ? [...previous, ...response.items] : response.items);
      setCategories(response.categories);
      if (!append) setSelectedId(response.items[0]?.recordId || null);
      setHasMore(response.hasMore);
      setPageToken(response.pageToken);
      setTotal(response.total);
    } catch (cause) {
      if (current !== request.current) return;
      const message = cause instanceof Error ? cause.message : "正式事件加载失败";
      setError(message);
      logger.error("获取正式事件列表失败", cause);
    } finally {
      if (current === request.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [source, keyword, category]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  const loadParams = useCallback(async (recordId: string) => {
    setParams({ loading: true, error: null, items: [], total: 0 });
    try {
      const response = await getOfficialParams(recordId);
      if (recordId === selectedRef.current) setParams({ loading: false, error: null, ...response });
    } catch (cause) {
      if (recordId === selectedRef.current) {
        const message = cause instanceof Error ? cause.message : "正式参数加载失败";
        setParams({ loading: false, error: message, items: [], total: 0 });
      }
    }
  }, []);

  useEffect(() => {
    selectedRef.current = selectedId;
    setParamKeyword("");
    if (selectedId) void loadParams(selectedId);
  }, [selectedId, loadParams]);

  const search = () => {
    const next = searchInput.trim();
    if (next === keyword) void fetchEvents();
    else setKeyword(next);
  };

  const copy = async (content: unknown, success: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(content, null, 2));
      toast.success(success);
    } catch {
      toast.error("复制失败，请检查浏览器剪贴板权限");
    }
  };

  const copyAll = () => {
    if (!selected || params.loading || params.error) return;
    void copy({ event: selected, params: params.items }, "已复制事件及全部正式参数");
  };

  return (
    <div className="query-library space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <LiquidToggle checked={source === 'app'} onCheckedChange={on => {
          setCategory(""); setCategories([]); setSource(on ? 'app' : 'web');
        }} />
        <Select value={category || "all"} onValueChange={(value) => setCategory(value === "all" ? "" : value)} disabled={categories.length === 0}>
          <SelectTrigger aria-label="筛选一级分类" className="h-9 w-32 rounded-full text-xs focus-visible:border-primary focus-visible:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">全部分类</SelectItem>
            {categories.map((item) => <SelectItem key={item} value={item} className="text-xs">{item}</SelectItem>)}
          </SelectContent>
        </Select>
        <SeekSearch
          value={searchInput}
          onChange={setSearchInput}
          onSubmit={search}
          onClear={() => { setSearchInput(""); setKeyword(""); }}
          placeholder="搜索事件、分类、参数或枚举"
          disabled={loading}
          suggestions={events
            .filter((event) => {
              const query = searchInput.trim().toLowerCase();
              if (!query) return false;
              return [event.evtId, event.eventName, event.category].some((value) => value?.toLowerCase().includes(query));
            })
            .map((event) => ({ id: event.recordId, label: event.evtId, meta: event.eventName }))}
          onSelectSuggestion={(suggestion) => {
            setSearchInput(suggestion.label);
            setKeyword(suggestion.label);
          }}
        />
        {keyword && <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline" onClick={() => { setSearchInput(""); setKeyword(""); }}>清除搜索</button>}
      </div>

      <div className="grid min-h-[560px] grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(290px,370px)_minmax(0,1fr)]">
        <section className="query-results min-w-0 overflow-hidden rounded-2xl bg-card p-2" aria-label="事件搜索结果">
          <div className="flex h-11 items-center justify-between px-3 text-xs font-medium text-muted-foreground"><span>事件列表</span><span className="tabular-nums">{events.length} / {total}</span></div>
          {loading && events.length === 0 && <div className="flex items-center gap-2 p-5 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在读取正式库...</div>}
          {error && events.length === 0 && <div className="space-y-3 p-5 text-xs"><p className="text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => void fetchEvents()}><RefreshCw />重试</Button></div>}
          {!loading && !error && events.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground"><Database className="mx-auto mb-3 h-5 w-5" /><p>{keyword || category ? "没有匹配的正式事件" : "正式库暂无事件"}</p></div>}
          <div className="space-y-1 max-h-[calc(100vh-250px)] min-h-0 overflow-y-auto max-lg:max-h-72">
            {events.map((event) => (
              <button key={event.recordId} type="button" onClick={() => setSelectedId(event.recordId)} aria-current={selectedId === event.recordId ? "true" : undefined}
                className={`flex w-full flex-col gap-2 rounded-xl px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${selectedId === event.recordId ? "bg-[var(--status-info-bg)]" : "hover:bg-accent/60"}`}>
                <span className="flex w-full items-start justify-between gap-2"><span className="min-w-0 break-all font-mono text-xs font-semibold text-foreground">{event.evtId}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${statusClass(event.status)}`}>{event.status || "未知"}</span></span>
                <span className="text-sm text-foreground">{event.eventName}</span>
                <span className="text-xs text-muted-foreground">{event.category ? `${event.category} · ` : ""}{event.platform || "端未标注"} · {event.version || "版本未标注"}</span>
              </button>
            ))}
          </div>
          {hasMore && !loading && <div className="p-3"><Button variant="outline" size="sm" className="w-full rounded-full" disabled={loadingMore} onClick={() => void fetchEvents(pageToken)}>{loadingMore ? <Loader2 className="animate-spin" /> : <ChevronDown />}加载更多</Button></div>}
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl bg-card" aria-label="事件及参数详情">
          {!selected && <div className="flex min-h-72 items-center justify-center text-xs text-muted-foreground">选择事件查看正式定义和参数</div>}
          {selected && <>
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><div className="break-all font-mono text-xs text-primary">{selected.evtId}</div><h2 className="mt-1 text-base font-semibold text-foreground">{selected.eventName}</h2></div>
                <Button size="sm" className="rounded-full" disabled={params.loading || Boolean(params.error)} onClick={copyAll}><ClipboardCopy />复制 AI 上下文</Button>
              </div>
              <dl className="mt-4 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                <Detail label="一级分类" value={selected.category} /><Detail label="端" value={selected.platform} /><Detail label="上线版本" value={selected.version} /><Detail label="状态" value={selected.status} />
                <Detail label="事件定义" value={selected.eventDefinition} wide /><Detail label="触发时机" value={selected.triggerTiming} wide /><Detail label="指标 / 使用场景" value={selected.metricScenario} wide />
              </dl>
              {params.baseLink && <a href={params.baseLink} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">原始 Base <ExternalLink className="h-3 w-3" /></a>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
              <div className="flex items-baseline gap-2"><h3 className="text-sm font-semibold">正式参数</h3><span className="text-xs text-muted-foreground tabular-nums">{params.loading ? "读取中" : `${params.total} 个`}</span></div>
              <div className="flex items-center gap-2">
                <RadialMenu actions={[
                  { key: "event", label: "复制事件", Icon: ClipboardCopy, onSelect: () => void copy(selected, "已复制事件信息") },
                  { key: "params", label: "复制参数", Icon: Check, disabled: params.loading || Boolean(params.error), onSelect: () => void copy(params.items, "已复制正式参数") },
                  { key: "all", label: "复制全部", Icon: Database, disabled: params.loading || Boolean(params.error), onSelect: copyAll },
                ]} />
              </div>
            </div>
            <ParamDetailPanel rowData={params} keyword={paramKeyword} onKeywordChange={setParamKeyword} onRetry={() => void loadParams(selected.recordId)} />
          </>}
        </section>
      </div>
    </div>
  );
}

function Detail({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-full" : ""}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-foreground">{value || "-"}</dd></div>;
}
