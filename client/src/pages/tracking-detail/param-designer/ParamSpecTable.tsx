import { Edit, Trash2 } from 'lucide-react';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@client/src/components/ui/table';
import type { ParamDetail, TrackingSource } from '@shared/api.interface';
import { normalizePlatformDisplay } from './param-display.utils';

interface ParamSpecTableProps {
  items: ParamDetail[];
  source: TrackingSource;
  canEdit?: boolean;
  onEdit?: (item: ParamDetail) => void;
  onDelete?: (item: ParamDetail) => void;
}

const ParamSpecTable = ({
  items,
  source,
  canEdit = false,
  onEdit,
  onDelete,
}: ParamSpecTableProps) => (
  <div className="rounded-sm border border-border bg-card overflow-hidden">
    <Table className="min-w-[980px] table-fixed">
      <TableHeader>
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableHead className="h-9 w-[260px] py-0 text-xs font-medium">参数</TableHead>
          <TableHead className="h-9 w-[150px] py-0 text-xs font-medium">类型 / 规则</TableHead>
          <TableHead className="h-9 py-0 text-xs font-medium">参数定义</TableHead>
          <TableHead className="h-9 w-[240px] py-0 text-xs font-medium">枚举 / 示例</TableHead>
          <TableHead className="h-9 w-[180px] py-0 text-xs font-medium">条件说明</TableHead>
          {canEdit && (
            <TableHead className="h-9 w-[120px] py-0 text-xs font-medium">操作</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.recordId} className="align-top transition-colors">
            <TableCell className="whitespace-normal align-top">
              <div className="space-y-1">
                <div className="break-all font-mono text-xs text-foreground">{item.paramKey}</div>
                <div className="break-words text-xs text-muted-foreground">{item.paramName || '-'}</div>
              </div>
            </TableCell>
            <TableCell className="whitespace-normal align-top">
              <div className="flex flex-col items-start gap-1.5">
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px] font-normal">
                  {item.paramType || 'STRING'}
                </Badge>
                <Badge
                  variant={item.requiredRule === '非必传' ? 'outline' : 'default'}
                  className="h-5 rounded-sm px-1.5 text-[10px] font-normal"
                >
                  {item.requiredRule || (item.required ? '必传' : '非必传')}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {normalizePlatformDisplay(item.platform, source)}
                </span>
              </div>
            </TableCell>
            <TableCell className="whitespace-normal align-top">
              <TextBlock value={item.definition} fallback="未填写参数定义" />
            </TableCell>
            <TableCell className="whitespace-normal align-top">
              <div className="space-y-2">
                <SpecLine label="枚举" value={item.enumRange} />
                <SpecLine label="示例" value={item.example || item.defaultValue} />
              </div>
            </TableCell>
            <TableCell className="whitespace-normal align-top">
              <TextBlock value={item.triggerCondition} fallback="-" />
            </TableCell>
            {canEdit && (
              <TableCell className="whitespace-nowrap align-top">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onEdit?.(item)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-sm px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete?.(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export default ParamSpecTable;

function SpecLine({ label, value }: { label: string; value?: string }) {
  const text = (value || '').trim();
  return (
    <div>
      <div className="mb-0.5 text-[10px] text-muted-foreground">{label}</div>
      <TextBlock value={text} fallback="-" />
    </div>
  );
}

function TextBlock({ value, fallback }: { value?: string; fallback: string }) {
  const text = (value || '').trim();
  return (
    <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
      {text || <span className="text-muted-foreground">{fallback}</span>}
    </div>
  );
}

