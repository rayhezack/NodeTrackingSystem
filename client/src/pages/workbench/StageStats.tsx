import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Skeleton } from '@client/src/components/ui/skeleton';
import type { StageStat } from '@shared/api.interface';

const STAGE_LIST = [
  '埋点提需',
  '埋点设计',
  '埋点评审',
  '埋点开发',
  '埋点验收',
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
    <section data-ai-section-type="card-stat">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">阶段总览</h2>
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
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-card p-4 text-sm text-destructive">
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {loading
            ? Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/60 bg-card p-4 shadow-sm"
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
                    aria-pressed={activeStage === stage}
                    onClick={() => onStageClick(stage)}
                    className={`group flex min-h-[106px] flex-col rounded-lg border p-4 text-left bg-card transition-colors hover:border-primary/40 hover:bg-accent/30 ${
                      activeStage === stage
                        ? 'border-primary/40 ring-2 ring-primary/15'
                        : 'border-border/60'
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
