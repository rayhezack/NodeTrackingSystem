import { Check } from 'lucide-react';
import { UI_STAGE_NODES, isUiNodeCompleted, isUiNodeActive } from './stage-config';

interface ProcessFlowBarProps {
  baseStage: string;
  reviewStatus?: string;
  officialStatus?: string;
  onNodeClick?: (nodeKey: string) => void;
}

const ProcessFlowBar = ({
  baseStage,
  reviewStatus = '',
  officialStatus = '',
  onNodeClick,
}: ProcessFlowBarProps) => {
  return (
    <div className="overflow-x-auto border-b border-border bg-card px-4 py-4 sm:px-6">
      <div className="flex min-w-[760px] items-center justify-between">
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

          return (
            <div key={node.key} className="flex flex-1 items-center last:flex-none">
              {/* 节点 */}
              <button
                type="button"
                onClick={() => onNodeClick?.(node.key)}
                className="group flex flex-col items-center gap-1.5 focus:outline-none"
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : completed
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-border bg-card text-muted-foreground'
                  }`}
                  style={
                    completed
                      ? { borderColor: 'hsl(160, 84%, 39%)', backgroundColor: 'hsl(160, 84%, 39%)' }
                      : undefined
                  }
                >
                  {completed ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    <span className="text-[10px] font-medium">{index + 1}</span>
                  )}
                </div>
                <span
                  className={`text-xs whitespace-nowrap ${
                    active
                      ? 'font-medium text-primary'
                      : completed
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                  }`}
                  style={completed ? { color: 'hsl(160, 84%, 39%)' } : undefined}
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
                        ? 'hsl(160, 84%, 39%)'
                        : 'hsl(220, 13%, 91%)',
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
