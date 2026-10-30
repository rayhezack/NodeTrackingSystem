import { ChevronRight, Inbox } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Skeleton } from '@client/src/components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyMedia,
} from '@client/src/components/ui/empty';
import type { TodoItem } from '@shared/api.interface';

const STAGE_VARIANT: Record<string, string> = {
  埋点提需: 'bg-primary-soft text-primary border-primary/20',
  埋点设计: 'bg-[var(--status-warning-bg)] text-warning border-warning/25',
  埋点开发: 'bg-primary-soft text-primary border-primary/20',
  埋点验收: 'bg-[var(--status-warning-bg)] text-warning border-warning/25',
  埋点上线: 'bg-[var(--status-success-bg)] text-success border-success/25',
  归档: 'bg-muted text-muted-foreground border-border',
};

const PRIORITY_VARIANT: Record<string, string> = {
  P0: 'bg-[var(--status-error-bg)] text-destructive border-destructive/25',
  P1: 'bg-[var(--status-warning-bg)] text-warning border-warning/25',
  P2: 'bg-primary-soft text-primary border-primary/20',
  P3: 'bg-muted text-muted-foreground border-border',
};

interface MyTodosProps {
  todos: TodoItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onItemClick: (recordId: string, targetStage?: string) => void;
}

const MyTodos = ({
  todos,
  loading,
  error,
  onRefresh,
  onItemClick,
}: MyTodosProps) => {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">我的待办</h2>
          {!loading && todos.length > 0 && (
            <Badge
              variant="outline"
              className="h-5 rounded-full border-border bg-accent px-1.5 text-xs font-medium text-primary"
            >
              {todos.length}
            </Badge>
          )}
        </div>
      </div>
      <div>
        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-destructive">
            {error}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-7 text-xs"
              onClick={onRefresh}
            >
              重试
            </Button>
          </div>
        ) : todos.length === 0 ? (
          <Empty className="border-0 p-8">
            <EmptyMedia variant="icon">
              <Inbox className="h-5 w-5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-sm">暂无待办</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {todos.map((item) => (
              <li key={item.recordId} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onItemClick(item.recordId, item.targetStage)}
                  className="flex min-h-[126px] w-full min-w-0 flex-col items-start gap-3 rounded-lg border border-border/60 bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/20"
                >
                  <span className="flex w-full min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="block min-w-0 truncate text-sm text-foreground"
                        title={item.requestName || item.eventName || '未命名需求'}
                      >
                        {item.requestName || item.eventName || '未命名需求'}
                      </span>
                      {item.eventCount > 1 && (
                        <Badge variant="outline" className="h-5 shrink-0 rounded-full px-1.5 text-xs font-medium text-muted-foreground">
                          {item.eventCount} 个事件
                        </Badge>
                      )}
                    </span>
                    <span
                      className="mt-0.5 block truncate font-mono text-xs text-muted-foreground"
                      title={eventTitle(item.eventIds)}
                    >
                      {formatTodoEventSummary(item)}
                    </span>
                  </span>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Badge variant="outline" className="h-5 shrink-0 rounded-full px-1.5 text-xs font-medium">{item.source === 'web' ? 'Web' : 'App'}</Badge>
                      {item.todoRole && <Badge variant="outline" className="h-5 rounded-full px-1.5 text-xs font-medium">{item.todoRole}</Badge>}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </span>
                  <span className="flex w-full items-center justify-between gap-2">
                    <Badge className={`h-5 rounded-full px-1.5 text-xs font-medium ${STAGE_VARIANT[item.stage] || ''}`}>{item.stage}</Badge>
                    <Badge className={`h-5 w-10 shrink-0 justify-center rounded-full px-1 text-xs font-medium ${PRIORITY_VARIANT[item.priority] || PRIORITY_VARIANT.P3}`}>{item.priority || '-'}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default MyTodos;

function eventTitle(values: string[]): string {
  return values.filter(Boolean).join('\n');
}

function formatTodoEventSummary(item: TodoItem): string {
  const eventIds = item.eventIds.filter(Boolean);
  if (!eventIds.length) return '待填写 evt_id';
  if (eventIds.length === 1) return eventIds[0];
  const visible = eventIds.slice(0, 3).join('、');
  return eventIds.length > 3 ? `${visible} 等 ${eventIds.length} 个 evt_id` : visible;
}
