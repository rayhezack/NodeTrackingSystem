import { ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@client/src/components/ui/button";
import { Input } from "@client/src/components/ui/input";
import type { OfficialParam } from "@shared/api.interface";

interface ParamState {
  loading: boolean;
  error: string | null;
  items: OfficialParam[];
  total: number;
  baseLink?: string;
}

interface Props {
  rowData: ParamState;
  keyword: string;
  onKeywordChange: (value: string) => void;
  onRetry: () => void;
}

function CellValue({ value }: { value?: string }) {
  if (!value) return <span className="text-muted-foreground">-</span>;
  const url = value.trim().match(/^https?:\/\/\S+$/i)?.[0];
  return url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">打开链接 <ExternalLink className="h-3 w-3" /></a> : <>{value}</>;
}

function getParamName(param: OfficialParam) {
  return param.paramName || param.paramKey.split(".").at(-1) || "-";
}

export function ParamDetailPanel({ rowData, keyword, onKeywordChange, onRetry }: Props) {
  if (rowData.loading) return <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在读取参数...</div>;
  if (rowData.error) return <div className="space-y-3 p-6 text-xs"><p className="text-destructive">参数加载失败：{rowData.error}</p><Button size="sm" variant="outline" onClick={onRetry}><RefreshCw />重试</Button></div>;

  const query = keyword.trim().toLocaleLowerCase();
  const items = rowData.items.filter((param) => !query || [param.paramKey, param.paramName, param.paramType, param.requiredRule, param.triggerCondition, param.enumRange, param.definition, param.notes, param.version, param.platform, param.sourceTable].join(" ").toLocaleLowerCase().includes(query));

  return <div className="min-w-0 px-4 py-4 sm:px-6">
    <div className="relative mb-3 max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input aria-label="筛选当前事件参数" value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="筛选参数 key、定义或枚举" className="h-9 rounded-sm pl-8 text-xs" />
    </div>
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[680px] border-collapse text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground"><tr>{["参数名称", "类型 / 必传", "枚举 / 范围", "定义 / 备注"].map((label) => <th key={label} scope="col" className="border-b border-border px-3 py-2 font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {items.map((param, index) => <tr key={`${param.paramKey}-${index}`} className="align-top hover:bg-accent/40">
            <td className="w-[25%] px-3 py-2"><div className="break-all font-mono font-medium text-foreground">{getParamName(param)}</div>{param.platform && <div className="mt-1 text-muted-foreground">{param.platform}</div>}</td>
            <td className="w-[18%] px-3 py-2"><div>{param.paramType || "-"}</div><div className="mt-1 text-muted-foreground">{param.requiredRule || (param.required ? "必传" : "非必传")}</div>{param.triggerCondition && <div className="mt-1 whitespace-pre-wrap text-muted-foreground">条件：{param.triggerCondition}</div>}</td>
            <td className="w-[25%] whitespace-pre-wrap break-words px-3 py-2 text-foreground"><CellValue value={param.enumRange} /></td>
            <td className="whitespace-pre-wrap break-words px-3 py-2"><CellValue value={param.definition} />{param.notes && <div className="mt-1 text-muted-foreground">备注：<CellValue value={param.notes} /></div>}{param.version && <div className="mt-1 text-muted-foreground">版本：{param.version}</div>}{param.sourceTable && <div className="mt-1 text-muted-foreground">来源：{param.sourceTable}</div>}</td>
          </tr>)}
          {items.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{query ? "没有匹配的参数" : "当前事件没有正式参数"}</td></tr>}
        </tbody>
      </table>
    </div>
    {query && <p className="mt-2 text-xs tabular-nums text-muted-foreground">匹配 {items.length} / {rowData.total} 个参数</p>}
  </div>;
}
