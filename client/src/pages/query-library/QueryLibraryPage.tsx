import { useState, useCallback, useEffect } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Database,
  Info,
} from "lucide-react";
import { logger } from "@lark-apaas/client-toolkit/logger";
import { Input } from "@client/src/components/ui/input";
import { Button } from "@client/src/components/ui/button";
import { Badge } from "@client/src/components/ui/badge";
import { Skeleton } from "@client/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@client/src/components/ui/table";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@client/src/components/ui/empty";
import {
  getOfficialEvents,
  getOfficialParams,
} from "@client/src/api/query-library";
import type { OfficialEvent, TrackingSource } from "@shared/api.interface";
import { ParamDetailPanel } from "./ParamDetailPanel";
import type { ExpandedRow } from "./ParamDetailPanel";

// 状态 → 语义色映射
function getStatusVariant(status: string): "default" | "secondary" | "outline" {
  const s = status || "";
  if (["上线", "已上线", "稳定", "稳定归档", "成功"].some((k) => s.includes(k))) {
    return "default";
  }
  if (["废弃", "已废弃", "下线", "错误"].some((k) => s.includes(k))) {
    return "secondary";
  }
  return "outline";
}

function getStatusStyle(status: string): string {
  const s = status || "";
  if (["上线", "已上线", "稳定", "稳定归档", "成功"].some((k) => s.includes(k))) {
    return "border-transparent text-[hsl(160_84%_39%)] bg-[hsl(160_84%_96%)]";
  }
  if (["评审", "待", "进行中", "开发"].some((k) => s.includes(k))) {
    return "border-transparent text-[hsl(38_92%_50%)] bg-[hsl(38_92%_96%)]";
  }
  if (["废弃", "已废弃", "下线", "错误"].some((k) => s.includes(k))) {
    return "border-transparent text-[hsl(0_84%_60%)] bg-[hsl(0_84%_96%)]";
  }
  return "";
}

const QueryLibraryPage = () => {
  const [source, setSource] = useState<TrackingSource>("app");
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [events, setEvents] = useState<OfficialEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, ExpandedRow>>({});

  const fetchEvents = useCallback(
    async (kw: string, token?: string, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await getOfficialEvents({
          source,
          keyword: kw || undefined,
          pageSize: 20,
          pageToken: token,
        });
        if (append) {
          setEvents((prev) => [...prev, ...res.items]);
        } else {
          setEvents(res.items);
        }
        setHasMore(res.hasMore);
        setPageToken(res.pageToken);
        setTotal(res.total);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "加载失败";
        setError(msg);
        logger.error("获取正式事件列表失败", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [source],
  );

  // 首次加载与 App/Web 分库切换
  useEffect(() => {
    setExpanded({});
    fetchEvents(keyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const handleSearch = useCallback(() => {
    setKeyword(searchInput.trim());
    fetchEvents(searchInput.trim());
  }, [searchInput, fetchEvents]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch],
  );

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    fetchEvents(keyword, pageToken, true);
  }, [hasMore, loadingMore, keyword, pageToken, fetchEvents]);

  const toggleExpand = useCallback(
    async (record: OfficialEvent) => {
      const recordId = record.recordId;
      if (expanded[recordId]) {
        setExpanded((prev) => {
          const next = { ...prev };
          delete next[recordId];
          return next;
        });
        return;
      }

      setExpanded((prev) => ({
        ...prev,
        [recordId]: { loading: true, error: null, items: [], total: 0 },
      }));

      try {
        const res = await getOfficialParams(recordId);
        setExpanded((prev) => ({
          ...prev,
          [recordId]: {
            loading: false,
            error: null,
            items: res.items,
            total: res.total,
            baseLink: res.baseLink,
          },
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "加载参数失败";
        setExpanded((prev) => ({
          ...prev,
          [recordId]: {
            loading: false,
            error: msg,
            items: [],
            total: 0,
          },
        }));
        logger.error("获取参数明细失败", err);
      }
    },
    [expanded],
  );

  const handleRetry = useCallback(() => {
    fetchEvents(keyword);
  }, [fetchEvents, keyword]);

  return (
    <div className="flex flex-col gap-3">
      {/* 搜索栏 */}
      <div className="flex items-center gap-2 rounded-sm border border-border bg-card p-2">
        <SourceSegment
          value={source}
          onChange={(nextSource) => {
            setSource(nextSource);
            setPageToken(undefined);
          }}
        />
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索 evt_id 或事件名"
            className="h-8 pl-8 text-sm rounded-sm"
          />
        </div>
        <Button
          size="sm"
          onClick={handleSearch}
          disabled={loading}
          className="h-8 rounded-sm"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          搜索
        </Button>
        {keyword && (
          <span className="text-xs text-muted-foreground">
            共 {total} 条结果
          </span>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-sm border border-[hsl(217_91%_86%)] bg-[hsl(217_91%_97%)] px-3 py-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-0.5 text-xs">
          <div className="font-medium text-foreground">
            正式查询库按 App / Web 分库展示，是已上线埋点的只读资产目录
          </div>
          <div className="text-muted-foreground">
            当前查看 {source === "web" ? "Web 正式库" : "App 正式库"}；用于按 evt_id / 事件名查询正式口径、上线状态和参数入口，需求设计、开发、校验仍从「埋点工作台」进入。
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-sm border border-border bg-card shadow-none">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-8 pl-3"></TableHead>
              <TableHead className="w-48 text-xs font-medium text-muted-foreground">
                evt_id
              </TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">
                事件名
              </TableHead>
              <TableHead className="w-24 text-xs font-medium text-muted-foreground">
                平台
              </TableHead>
              <TableHead className="w-24 text-xs font-medium text-muted-foreground">
                版本
              </TableHead>
              <TableHead className="w-24 text-xs font-medium text-muted-foreground">
                状态
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && events.length === 0 && (
              <>
                {Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-3">
                      <Skeleton className="h-4 w-4 rounded-sm" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32 rounded-sm" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-48 rounded-sm" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12 rounded-sm" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-10 rounded-sm" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-14 rounded-sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}

            {error && events.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <Empty className="border-0">
                    <EmptyMedia variant="icon">
                      <RefreshCw className="h-5 w-5" />
                    </EmptyMedia>
                    <EmptyContent>
                      <EmptyTitle>加载失败</EmptyTitle>
                      <EmptyDescription>{error}</EmptyDescription>
                      <Button
                        size="sm"
                        onClick={handleRetry}
                        className="mt-2 rounded-sm"
                      >
                        重试
                      </Button>
                    </EmptyContent>
                  </Empty>
                </TableCell>
              </TableRow>
            )}

            {!loading && !error && events.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <Empty className="border-0">
                    <EmptyMedia variant="icon">
                      <Database className="h-5 w-5" />
                    </EmptyMedia>
                    <EmptyContent>
                      <EmptyTitle>暂无数据</EmptyTitle>
                      <EmptyDescription>
                        {keyword
                          ? "未找到匹配的事件，请尝试其他关键词"
                          : `${source === "web" ? "Web" : "App"} 查询库中暂无事件数据`}
                      </EmptyDescription>
                    </EmptyContent>
                  </Empty>
                </TableCell>
              </TableRow>
            )}

            {events.map((event) => {
              const isExpanded = !!expanded[event.recordId];
              const rowData = expanded[event.recordId];
              return (
                <EventRow
                  key={event.recordId}
                  event={event}
                  expanded={isExpanded}
                  rowData={rowData}
                  onToggle={() => toggleExpand(event)}
                />
              );
            })}
          </TableBody>
        </Table>

        {/* 加载更多 */}
        {!loading && !error && events.length > 0 && hasMore && (
          <div className="flex justify-center border-t border-border p-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="rounded-sm"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载中...
                </>
              ) : (
                "加载更多"
              )}
            </Button>
          </div>
        )}

        {!loading && !error && events.length > 0 && !hasMore && (
          <div className="border-t border-border p-3 text-center text-xs text-muted-foreground">
            已加载全部 {total} 条
          </div>
        )}
      </div>
    </div>
  );
};

interface EventRowProps {
  event: OfficialEvent;
  expanded: boolean;
  rowData?: ExpandedRow;
  onToggle: () => void;
}

function SourceSegment({
  value,
  onChange,
}: {
  value: TrackingSource;
  onChange: (value: TrackingSource) => void;
}) {
  const options: Array<{ value: TrackingSource; label: string }> = [
    { value: "app", label: "App" },
    { value: "web", label: "Web" },
  ];

  return (
    <div className="flex h-8 shrink-0 overflow-hidden rounded-sm border border-border bg-muted/20">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-3 text-xs transition-colors ${
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EventRow({ event, expanded, rowData, onToggle }: EventRowProps) {
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-accent/50"
        onClick={onToggle}
      >
        <TableCell className="pl-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-mono text-xs text-foreground">
          {event.evtId || "-"}
        </TableCell>
        <TableCell className="text-sm text-foreground">
          {event.eventName || "-"}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {event.platform || "-"}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {event.version || "-"}
        </TableCell>
        <TableCell>
          <Badge
            variant={getStatusVariant(event.status)}
            className={`rounded-sm ${getStatusStyle(event.status)}`}
          >
            {event.status || "-"}
          </Badge>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={6} className="p-0">
            <ParamDetailPanel rowData={rowData} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default QueryLibraryPage;
