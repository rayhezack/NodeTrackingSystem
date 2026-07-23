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
    <nav className="w-full md:w-[200px] shrink-0">
      <div className="sticky top-4 space-y-0.5">
        {SIDEBAR_STAGES.map((stage) => {
          const isActive = activeStage === stage.id;
          const canEdit = permissions[stage.permissionKey];

          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onStageChange(stage.id)}
              className={`group flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-accent'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>{stage.label}</span>
                {!canEdit && (
                  <span
                    className="text-[10px] text-muted-foreground"
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
