import { Check } from 'lucide-react';
import { UI_STAGE_NODES, isUiNodeCompleted, isUiNodeActive } from './stage-config';

interface ProcessFlowBarProps {
  baseStage: string;
  reviewStatus?: string;
  officialStatus?: string;
  viewingNode?: string;
  disabled?: boolean;
  onNodeClick?: (nodeKey: string) => void;
}

const ProcessFlowBar = ({
  baseStage,
  reviewStatus = '',
  officialStatus = '',
  viewingNode,
  disabled = false,
  onNodeClick,
}: ProcessFlowBarProps) => {
  return (
    <div className="overflow-x-auto border-b border-border/60 bg-card px-4 py-5 sm:px-6">
      <div className="flex min-w-[760px] items-center justify-between gap-1">
        {UI_STAGE_NODES.map((node, index) => {
          const completed = isUiNodeCompleted(
            baseStage,
            node.key,
            reviewStatus,
            officialStatus,
          );
          const active = isUiNodeActive(
            baseStage,
            node.key,
            reviewStatus,
            officialStatus,
          );
          const isLast = index === UI_STAGE_NODES.length - 1;
          const selected = node.key === viewingNode;

          return (
            <div key={node.key} className="flex flex-1 items-center last:flex-none">
              {/* 节点 */}
              <button
                type="button"
                aria-label={`${node.label}，${completed ? '已完成' : active ? '进行中' : '待开始'}`}
                aria-current={active ? 'step' : undefined}
                aria-pressed={selected}
                data-selected={selected || undefined}
                disabled={disabled || !onNodeClick}
                title={`查看${node.label}`}
                onClick={() => onNodeClick?.(node.key)}
                className="group relative flex min-w-[72px] flex-col items-center gap-1.5 rounded-lg px-3 py-2 transition-[background-color,transform,box-shadow] duration-150 ease-out hover:bg-primary/5 active:scale-[0.96] active:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none"
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-[box-shadow,transform] duration-150 group-hover:ring-4 group-hover:ring-primary/10 group-active:scale-95 motion-reduce:transform-none motion-reduce:transition-none ${
                    selected || (!viewingNode && active)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : completed
                        ? 'border-success/25 bg-[var(--status-success-bg)] text-success'
                        : active
                          ? 'border-primary/40 bg-primary/5 text-primary'
                          : 'border-border bg-card text-muted-foreground'
                  }`}

                >
                  {completed ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    <span className="text-xs font-medium">{index + 1}</span>
                  )}
                </div>
                <span
                  className={`text-xs whitespace-nowrap ${
                    active
                      ? 'font-medium text-primary'
                      : completed
                        ? 'text-success'
                        : 'text-muted-foreground'
                  }`}
                >
                  {node.label}
                </span>
              </button>

              {/* 连接线 */}
              {!isLast && (
                <div className="mx-2 flex-1">
                  <div
                    className="h-0.5 rounded-full"
                    style={{
                      backgroundColor: completed
                        ? 'var(--success)'
                        : 'var(--border)',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProcessFlowBar;
