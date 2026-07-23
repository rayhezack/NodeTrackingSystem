import { RefreshCw, ChevronRight, Inbox } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Skeleton } from '@client/src/components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from '@client/src/components/ui/empty';
import type { TodoItem } from '@shared/api.interface';

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

interface MyTodosProps {
  todos: TodoItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onItemClick: (recordId: string) => void;
}

const MyTodos = ({
  todos,
  loading,
  error,
  onRefresh,
  onItemClick,
}: MyTodosProps) => {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-foreground">我的待办</h2>
          {!loading && todos.length > 0 && (
            <Badge
              variant="outline"
              className="h-5 rounded-sm bg-[hsl(217_91%_96%)] px-1.5 text-[10px] font-medium text-[hsl(217_91%_45%)] border-[hsl(217_91%_90%)]"
            >
              {todos.length}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
          />
          刷新
        </Button>
      </div>
      <div className="rounded-sm border border-border bg-card">
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
            <EmptyContent>
              <EmptyDescription className="text-xs">
                所有事项都已处理完毕
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {todos.map((item) => (
              <li key={item.recordId}>
                <button
                  type="button"
                  onClick={() => onItemClick(item.recordId)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="w-24 shrink-0 font-mono text-xs text-primary">
                    {item.evtId || '-'}
                  </span>
                  <span className="flex-1 truncate text-sm text-foreground">
                    {item.eventName || '-'}
                  </span>
                  <Badge
                    className={`h-5 rounded-sm px-1.5 text-[10px] font-medium ${STAGE_VARIANT[item.stage] || ''}`}
                  >
                    {item.stage}
                  </Badge>
                  <Badge
                    className={`h-5 w-10 shrink-0 justify-center rounded-sm px-1 text-[10px] font-medium ${PRIORITY_VARIANT[item.priority] || PRIORITY_VARIANT.P3}`}
                  >
                    {item.priority || '-'}
                  </Badge>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                    {item.platform || '-'}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
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
