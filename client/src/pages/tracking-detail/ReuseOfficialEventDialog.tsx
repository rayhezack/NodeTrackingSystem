import { useCallback, useEffect, useState } from 'react';
import { Database, Loader2, Search, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Input } from '@client/src/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import { getOfficialEvents, getOfficialParams } from '@client/src/api/query-library';
import { reuseOfficialTrackingEvent } from '@client/src/api/tracking';
import type {
  OfficialEvent,
  OfficialParam,
  ReuseOfficialEventResponse,
  TrackingDetail,
} from '@shared/api.interface';

interface ReuseOfficialEventDialogProps {
  open: boolean;
  detail: TrackingDetail;
  actorId?: string;
  actorLarkId?: string;
  onClose: () => void;
  onReused: (result: ReuseOfficialEventResponse) => void | Promise<void>;
}

export default function ReuseOfficialEventDialog({
  open,
  detail,
  actorId,
  actorLarkId,
  onClose,
  onReused,
}: ReuseOfficialEventDialogProps) {
  const [keyword, setKeyword] = useState('');
  const [events, setEvents] = useState<OfficialEvent[]>([]);
  const [selected, setSelected] = useState<OfficialEvent | null>(null);
  const [params, setParams] = useState<OfficialParam[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingParams, setLoadingParams] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async (kw = keyword) => {
    setLoading(true);
    try {
      const res = await getOfficialEvents({
        source: detail.source,
        keyword: kw.trim() || undefined,
        pageSize: 20,
      });
      setEvents(res.items || []);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '正式事件加载失败';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [detail.source, keyword]);

  useEffect(() => {
    if (!open) return;
    setKeyword('');
    setSelected(null);
    setParams([]);
    fetchEvents('');
  }, [open, fetchEvents]);

  useEffect(() => {
    if (!selected) {
      setParams([]);
      return;
    }
    let cancelled = false;
    const loadParams = async () => {
      setLoadingParams(true);
      try {
        const res = await getOfficialParams(selected.recordId);
        if (!cancelled) setParams(res.items || []);
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : '参数加载失败';
          toast.error(msg);
          setParams([]);
        }
      } finally {
        if (!cancelled) setLoadingParams(false);
      }
    };
    loadParams();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handleReuse = async () => {
    if (!selected) {
      toast.error('请选择要复用的正式事件');
      return;
    }
    setSaving(true);
    try {
      const result = await reuseOfficialTrackingEvent(detail.recordId, {
        officialRecordId: selected.recordId,
        actorId,
        actorLarkId,
      });
      toast.success(`已复用正式事件，并导入 ${result.importedParamCount} 个参数`);
      await onReused(result);
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '复用失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const reuseTargetCopy = detail.evtId
    ? '当前事件已有 evt_id，将在同一需求下新增一条复用事件。'
    : '当前事件尚未填写 evt_id，将直接复用到当前设计记录。';

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !saving && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-primary" />
            复用已有正式事件
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-sm border border-[hsl(217_91%_86%)] bg-[hsl(217_91%_97%)] px-3 py-2 text-xs text-muted-foreground">
          从{detail.source === 'web' ? ' Web ' : ' App '}正式查询库选择已有事件，系统会回填事件定义、触发时机和版本，并将正式参数复制为本次需求的设计参数草稿。{reuseTargetCopy}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 rounded-sm pl-8 text-xs"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') fetchEvents(keyword);
                  }}
                  placeholder="搜索 evt_id 或事件名"
                  disabled={loading || saving}
                />
              </div>
              <Button
                size="sm"
                className="h-8 rounded-sm"
                onClick={() => fetchEvents(keyword)}
                disabled={loading || saving}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                搜索
              </Button>
            </div>

            <div className="rounded-sm border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-48 text-xs">evt_id</TableHead>
                    <TableHead className="text-xs">事件名</TableHead>
                    <TableHead className="w-24 text-xs">版本</TableHead>
                    <TableHead className="w-20 text-xs">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && !events.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-28 text-center text-xs text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                        正在加载正式事件...
                      </TableCell>
                    </TableRow>
                  ) : events.length ? (
                    events.map((event) => (
                      <TableRow
                        key={event.recordId}
                        className={`cursor-pointer ${selected?.recordId === event.recordId ? 'bg-primary/10 hover:bg-primary/10' : ''}`}
                        onClick={() => setSelected(event)}
                      >
                        <TableCell className="max-w-[220px] truncate font-mono text-xs">
                          {event.evtId}
                        </TableCell>
                        <TableCell className="text-xs">{event.eventName}</TableCell>
                        <TableCell className="text-xs">{event.version || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px] font-normal">
                            {event.status || '-'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-28 text-center text-xs text-muted-foreground">
                        未找到正式事件
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-3 rounded-sm border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Database className="h-4 w-4 text-primary" />
              复用预览
            </div>
            {selected ? (
              <>
                <div className="grid gap-2 text-xs">
                  <PreviewLine label="evt_id" value={selected.evtId} mono />
                  <PreviewLine label="事件名" value={selected.eventName} />
                  <PreviewLine label="端" value={selected.platform} />
                  <PreviewLine label="版本" value={selected.version} />
                </div>
                <div className="rounded-sm border border-border bg-card">
                  <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                    正式参数预览 {loadingParams ? '' : `(${params.length})`}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {loadingParams ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                        正在加载参数...
                      </div>
                    ) : params.length ? (
                      <div className="divide-y divide-border">
                        {params.slice(0, 12).map((param) => (
                          <div key={param.paramKey || param.paramName} className="px-3 py-2 text-xs">
                            <div className="break-all font-mono text-foreground">{param.paramKey || param.paramName}</div>
                            <div className="mt-1 text-muted-foreground">
                              {param.paramType || '-'} · {param.requiredRule || '非必传'}
                              {param.enumRange ? ` · 枚举：${param.enumRange}` : ''}
                            </div>
                          </div>
                        ))}
                        {params.length > 12 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            还有 {params.length - 12} 个参数，将一并导入。
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        该正式事件暂无参数明细
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-sm border border-dashed border-border bg-card py-12 text-center text-xs text-muted-foreground">
                请先从左侧选择一个正式事件
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-sm"
            onClick={handleReuse}
            disabled={!selected || saving}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
            {saving ? '复用中...' : '确认复用'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewLine({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`break-words text-foreground ${mono ? 'font-mono' : ''}`}>
        {value || '-'}
      </span>
    </div>
  );
}
