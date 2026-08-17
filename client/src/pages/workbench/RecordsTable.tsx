import { useEffect, useState } from 'react';
import {
  Search,
  RefreshCw,
  Inbox,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Badge } from '@client/src/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import { Skeleton } from '@client/src/components/ui/skeleton';
import { UserDisplay } from '@client/src/components/business-ui/user-display';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from '@client/src/components/ui/empty';
import type { TrackingRecord } from '@shared/api.interface';

const STAGE_LIST = [
  '埋点提需',
  '埋点设计',
  '埋点开发',
  '埋点校验',
  '埋点上线',
  '归档',
] as const;

const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];
const PLATFORM_OPTIONS = ['iOS', 'Android', 'App', 'Web'];

const STAGE_VARIANT: Record<string, string> = {
  埋点提需: 'bg-[hsl(217_91%_96%)] text-[hsl(217_91%_40%)] border-[hsl(217_91%_90%)]',
  埋点设计: 'bg-[hsl(38_92%_96%)] text-[hsl(38_92%_40%)] border-[hsl(38_92%_90%)]',
  埋点开发: 'bg-[hsl(217_91%_96%)] text-[hsl(217_91%_40%)] border-[hsl(217_91%_90%)]',
  埋点校验: 'bg-[hsl(38_92%_96%)] text-[hsl(38_92%_40%)] border-[hsl(38_92%_90%)]',
  埋点上线: 'bg-[hsl(160_84%_96%)] text-[hsl(160_84%_35%)] border-[hsl(160_84%_90%)]',
  归档: 'bg-[hsl(220_14%_96%)] text-[hsl(220_9%_46%)] border-[hsl(220_13%_91%)]',
};

const PRIORITY_VARIANT: Record<string, string> = {
  P0: 'bg-[hsl(0_84%_96%)] text-[hsl(0_84%_50%)] border-[hsl(0_84%_90%)]',
  P1: 'bg-[hsl(38_92%_96%)] text-[hsl(38_92%_45%)] border-[hsl(38_92%_90%)]',
  P2: 'bg-[hsl(217_91%_96%)] text-[hsl(217_91%_45%)] border-[hsl(217_91%_90%)]',
  P3: 'bg-[hsl(220_14%_96%)] text-[hsl(220_9%_46%)] border-[hsl(220_13%_91%)]',
};

function formatTime(ts: number): string {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface RecordsTableProps {
  records: TrackingRecord[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  total: number;
  currentPage: number;
  pageSize: number;
  keyword: string;
  stage: string;
  priority: string;
  platform: string;
  onSearch: (keyword: string) => void;
  onStageChange: (stage: string) => void;
  onPriorityChange: (priority: string) => void;
  onPlatformChange: (platform: string) => void;
  onReset: () => void;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onRowClick: (recordId: string) => void;
}

const RecordsTable = ({
  records,
  loading,
  error,
  hasMore,
  loadingMore,
  total,
  currentPage,
  pageSize,
  keyword,
  stage,
  priority,
  platform,
  onSearch,
  onStageChange,
  onPriorityChange,
  onPlatformChange,
  onReset,
  onRetry,
  onPageChange,
  onRowClick,
}: RecordsTableProps) => {
  const [inputVal, setInputVal] = useState(keyword);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = total ? Math.min(currentPage * pageSize, total) : 0;

  useEffect(() => {
    setInputVal(keyword);
  }, [keyword]);

  const handleSearch = () => {
    onSearch(inputVal.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">需求列表</h2>
        <span className="text-xs text-muted-foreground">
          共 {total} 条 · 按更新时间倒序
        </span>
      </div>

      {/* 搜索筛选栏 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-card p-3">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索需求名 / evt_id / 事件名"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={stage} onValueChange={onStageChange}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="阶段" />
          </SelectTrigger>
          <SelectContent>
            {STAGE_LIST.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={onPriorityChange}>
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue placeholder="优先级" />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={platform} onValueChange={onPlatformChange}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="平台" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_OPTIONS.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8 rounded-sm text-xs"
          onClick={handleSearch}
          disabled={loading}
        >
          搜索
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-sm text-xs text-muted-foreground hover:text-foreground"
          onClick={onReset}
        >
          重置
        </Button>
      </div>

      {/* 表格 */}
      <div className="rounded-sm border border-border bg-card">
        {loading ? (
          <div className="p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-3.5 w-14" />
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        ) : error ? (
          <Empty className="border-0 p-12">
            <EmptyMedia variant="icon">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-sm">加载失败</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <EmptyDescription className="text-xs">{error}</EmptyDescription>
              <Button
                size="sm"
                className="mt-3 h-7 rounded-sm text-xs"
                onClick={onRetry}
              >
                重新加载
              </Button>
            </EmptyContent>
          </Empty>
        ) : records.length === 0 ? (
          <Empty className="border-0 p-12">
            <EmptyMedia variant="icon">
              <Inbox className="h-5 w-5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-sm">暂无数据</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <EmptyDescription className="text-xs">
                没有找到符合条件的埋点需求
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="h-9 w-56 px-3 text-xs font-medium text-muted-foreground">
                    埋点事件
                  </TableHead>
                  <TableHead className="h-9 w-16 px-3 text-xs font-medium text-muted-foreground">
                    库
                  </TableHead>
                  <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                    需求/事件名
                  </TableHead>
                  <TableHead className="h-9 w-24 px-3 text-xs font-medium text-muted-foreground">
                    阶段
                  </TableHead>
                  <TableHead className="h-9 w-16 px-3 text-xs font-medium text-muted-foreground">
                    优先级
                  </TableHead>
                  <TableHead className="h-9 w-28 px-3 text-xs font-medium text-muted-foreground">
                    平台
                  </TableHead>
                  <TableHead className="h-9 w-28 px-3 text-xs font-medium text-muted-foreground">
                    提需人
                  </TableHead>
                  <TableHead className="h-9 w-28 px-3 text-xs font-medium text-muted-foreground">
                    数据负责人
                  </TableHead>
                  <TableHead className="h-9 w-28 px-3 text-xs font-medium text-muted-foreground">
                    研发负责人
                  </TableHead>
                  <TableHead className="h-9 w-36 px-3 text-xs font-medium text-muted-foreground">
                    更新时间
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((rec) => {
                  const displayStage = rec.uiStage || rec.stage;
                  return (
                    <TableRow
                      key={rec.recordId}
                      className="h-9 cursor-pointer hover:bg-accent/50"
                      onClick={() => onRowClick(rec.recordId)}
                    >
                      <TableCell className="px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span
                              className="min-w-0 flex-1 truncate font-mono text-xs text-primary"
                              title={eventTitle(rec.eventIds)}
                            >
                              {rec.evtId || '待填写'}
                            </span>
                            {rec.eventCount > 1 && (
                              <Badge variant="outline" className="h-5 shrink-0 rounded-sm px-1.5 text-[10px] font-medium">
                                {rec.eventCount} 个事件
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-0">
                        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px] font-medium">
                          {rec.source === 'web' ? 'Web' : 'App'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs text-foreground">
                        <span className="block min-w-0 truncate">
                          {rec.requestName || rec.eventName || '未命名需求'}
                        </span>
                        {rec.eventCount > 1 && (
                          <span className="mt-0.5 block min-w-0 truncate text-[11px] text-muted-foreground" title={eventTitle(rec.eventNames)}>
                            {rec.eventNames.slice(0, 4).join('、')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-0">
                        <Badge
                          className={`h-5 rounded-sm px-1.5 text-[10px] font-medium ${STAGE_VARIANT[displayStage] || ''}`}
                        >
                          {displayStage}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-0">
                        <Badge
                          className={`h-5 w-8 justify-center rounded-sm px-1 text-[10px] font-medium ${PRIORITY_VARIANT[rec.priority] || PRIORITY_VARIANT.P3}`}
                        >
                          {rec.priority || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-0 text-xs text-foreground">
                        <span className="block truncate" title={rec.platform || '-'}>
                          {rec.platform || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-0 text-xs text-muted-foreground">
                        <OwnerDisplay
                          names={rec.requester}
                          ids={rec.requesterIds}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-0 text-xs text-muted-foreground">
                        <OwnerDisplay
                          names={rec.dataOwner}
                          ids={rec.dataOwnerIds}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-0 text-xs text-muted-foreground">
                        <OwnerDisplay
                          names={rec.devOwner}
                          ids={rec.devOwnerIds}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-0 text-xs text-muted-foreground">
                        {formatTime(rec.updatedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {(total > pageSize || currentPage > 1) && (
              <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-muted-foreground">
                  当前第 {currentPage} / {totalPages} 页，展示 {pageStart}-{pageEnd} 条
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-sm text-xs"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={loadingMore || currentPage <= 1}
                  >
                    <ChevronLeft className="mr-1 h-3 w-3" />
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-sm text-xs"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={loadingMore || !hasMore}
                  >
                    {loadingMore ? (
                      <>
                        <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                        加载中
                      </>
                    ) : (
                      <>
                        下一页
                        <ChevronRight className="ml-1 h-3 w-3" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default RecordsTable;

function OwnerDisplay({ names, ids }: { names: string[]; ids: string[] }) {
  const readableNames = names.map(normalizeOwnerName);

  if (ids.length) {
    return (
      <UserDisplay
        value={ids.map((id, index) => ({
          user_id: id,
          ...(readableNames[index] ? { name: readableNames[index] } : {}),
        }))}
        size="small"
        accountType="apaas"
        showUserProfile={false}
      />
    );
  }

  const fallbackNames = readableNames.filter(Boolean);
  return fallbackNames.length ? fallbackNames.join('、') : '-';
}

function normalizeOwnerName(name: string | undefined): string {
  const value = String(name || '').trim();
  return value && !/^\d+$/.test(value) && !value.startsWith('ou_') ? value : '';
}

function eventTitle(values: string[]): string {
  return values.filter(Boolean).join('\n');
}
