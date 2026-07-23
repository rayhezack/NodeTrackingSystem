import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@client/src/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@client/src/components/ui/table";
import type { OfficialParam } from "@shared/api.interface";

export interface ExpandedRow {
  loading: boolean;
  error: string | null;
  items: OfficialParam[];
  total: number;
}

interface ParamDetailPanelProps {
  rowData?: ExpandedRow;
}

function extractHttpUrl(value?: string): string {
  if (!value) return "";
  return value.trim().match(/https?:\/\/\S+/i)?.[0] ?? "";
}

function SmartCellValue({
  value,
  linkLabel,
}: {
  value?: string;
  linkLabel?: string;
}) {
  const rawValue = value?.trim();
  if (!rawValue) return <span className="text-muted-foreground">-</span>;

  const url = extractHttpUrl(rawValue);
  if (!url) return <>{rawValue}</>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
    >
      <span>{linkLabel || rawValue}</span>
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function ParamDetailPanel({ rowData }: ParamDetailPanelProps) {
  if (!rowData || rowData.loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载参数中...
      </div>
    );
  }

  if (rowData.error) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-xs text-muted-foreground">
        <span>参数加载失败：{rowData.error}</span>
      </div>
    );
  }

  if (rowData.items.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        暂无参数
      </div>
    );
  }

  return (
    <div className="p-4 pl-10">
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        参数明细（{rowData.total} 个）
      </div>
      <div className="rounded-sm border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-40 text-xs font-medium text-muted-foreground">
                参数 key
              </TableHead>
              <TableHead className="w-32 text-xs font-medium text-muted-foreground">
                参数名
              </TableHead>
              <TableHead className="w-24 text-xs font-medium text-muted-foreground">
                参数类型
              </TableHead>
              <TableHead className="w-20 text-xs font-medium text-muted-foreground">
                是否必传
              </TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">
                定义
              </TableHead>
              <TableHead className="w-40 text-xs font-medium text-muted-foreground">
                示例
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowData.items.map((param, idx) => (
              <TableRow key={`${param.paramKey}-${idx}`}>
                <TableCell className="font-mono text-xs">
                  {param.paramKey || "-"}
                </TableCell>
                <TableCell className="text-xs">
                  {param.paramName || "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {param.paramType || "-"}
                </TableCell>
                <TableCell className="text-xs">
                  {param.required ? (
                    <Badge
                      variant="outline"
                      className="rounded-sm border-transparent text-[hsl(0_84%_60%)] bg-[hsl(0_84%_96%)]"
                    >
                      必传
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">可选</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-foreground/80 whitespace-normal break-words max-w-md">
                  <SmartCellValue
                    value={param.definition}
                    linkLabel={
                      param.paramType === "LINK" ? "打开正式参数表" : undefined
                    }
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono whitespace-normal break-words max-w-xs">
                  <SmartCellValue
                    value={param.example}
                    linkLabel={param.paramType === "LINK" ? "打开链接" : undefined}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
