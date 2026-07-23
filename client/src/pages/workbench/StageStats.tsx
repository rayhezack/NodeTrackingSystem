import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Skeleton } from '@client/src/components/ui/skeleton';
import type { StageStat } from '@shared/api.interface';

const STAGE_LIST = [
  '埋点提需',
  '埋点设计',
  '埋点开发',
  '埋点校验',
  '埋点上线',
  '归档',
] as const;

interface StageStatsProps {
  stats: StageStat[];
  loading: boolean;
  error: string | null;
  activeStage: string;
  onRefresh: () => void;
  onStageClick: (stage: string) => void;
}

const StageStats = ({
  stats,
  loading,
  error,
  activeStage,
  onRefresh,
  onStageClick,
}: StageStatsProps) => {
  return (
    <section className="mb-6" data-ai-section-type="card-stat">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">阶段总览</h2>
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
      {error ? (
        <div className="flex items-center gap-2 rounded-sm border border-dashed border-border bg-card p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={onRefresh}
          >
            重试
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-sm border border-border bg-card p-4"
                >
                  <Skeleton className="mb-2 h-3 w-16" />
                  <Skeleton className="h-7 w-10" />
                </div>
              ))
            : STAGE_LIST.map((stage) => {
                const item = stats.find((s) => s.stage === stage);
                const count = item?.count ?? 0;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => onStageClick(stage)}
                    className={`group flex flex-col rounded-sm border bg-card p-4 text-left transition-colors hover:bg-accent ${
                      activeStage === stage
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border'
                    }`}
                  >
                    <span className="text-xs text-muted-foreground">
                      {stage}
                    </span>
                    <span className="mt-1 text-2xl font-semibold text-foreground">
                      {count}
                    </span>
                  </button>
                );
              })}
        </div>
      )}
    </section>
  );
};

export default StageStats;
