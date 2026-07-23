import { Wrench } from 'lucide-react';

const ParamsDesignerPlaceholder = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-medium text-foreground">参数设计</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          配置事件参数的详细定义，包括参数名、类型、枚举值、说明等
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border bg-muted/30 py-16">
        <Wrench className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground font-medium">参数设计器开发中</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          敬请期待，后续版本将支持可视化参数配置
        </p>
      </div>
    </div>
  );
};

export default ParamsDesignerPlaceholder;
