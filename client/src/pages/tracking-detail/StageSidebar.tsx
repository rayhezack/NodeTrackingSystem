import { ChevronRight } from 'lucide-react';
import { SIDEBAR_STAGES } from './stage-config';
import type { TrackingDetailPermissions } from '@shared/api.interface';

interface StageSidebarProps {
  activeStage: string;
  permissions: TrackingDetailPermissions;
  onStageChange: (stageId: string) => void;
}

const StageSidebar = ({ activeStage, permissions, onStageChange }: StageSidebarProps) => {
  return (
    <nav aria-label="生命周期阶段" className="w-full shrink-0 overflow-x-auto bg-card p-3 md:w-[196px] md:overflow-visible">
      <div className="flex w-max gap-1 md:sticky md:top-4 md:w-auto md:flex-col">
        {SIDEBAR_STAGES.map((stage) => {
          const isActive = activeStage === stage.id;
          const canEdit = permissions[stage.permissionKey];

          return (
            <button
              key={stage.id}
              type="button"
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onStageChange(stage.id)}
              className={`group flex shrink-0 items-center justify-between gap-3 rounded-full md:w-full px-3 py-2.5 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-primary-soft text-accent-foreground font-semibold'
                  : 'text-foreground hover:bg-accent'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>{stage.label}</span>
                {!canEdit && (
                  <span
                    className="text-xs text-muted-foreground"
                    title="无编辑权限"
                  >
                    只读
                  </span>
                )}
              </span>
              <ChevronRight
                className={`h-4 w-4 transition-transform ${
                  isActive ? 'text-primary' : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                }`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default StageSidebar;
