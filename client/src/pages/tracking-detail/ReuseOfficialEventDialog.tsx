import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Checklist, ChecklistCheckbox } from '@client/src/components/bencho/Checklist';
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
  const [chosen, setChosen] = useState<Record<string, OfficialEvent>>({});
  const [paramKeysByEvent, setParamKeysByEvent] = useState<Record<string, string[]>>({});
  const selectedParamKeys = selected ? paramKeysByEvent[selected.recordId] || [] : [];
  const setSelectedParamKeys = (keys: string[]) => {
    if (selected) setParamKeysByEvent((prev) => ({ ...prev, [selected.recordId]: keys }));
  };
  const paramsCache = useRef(new Map<string, OfficialParam[]>());
  const searchId = useRef(0);
  const [pageToken, setPageToken] = useState<string>();
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [progress, setProgress] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingParams, setLoadingParams] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async (kw = '', nextPage?: string) => {
    const requestId = ++searchId.current;
    setLoading(true);
    try {
      const res = await getOfficialEvents({
        source: detail.source,
        keyword: kw.trim() || undefined,
        pageSize: 50,
        pageToken: nextPage,
      });
      if (searchId.current !== requestId) return;
      setEvents((prev) => nextPage ? [...prev, ...res.items] : res.items || []);
      setPageToken(res.hasMore ? res.pageToken : undefined);
      setSubmittedKeyword(kw);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '正式事件加载失败';
      toast.error(msg);
    } finally {
      if (searchId.current === requestId) setLoading(false);
    }
  }, [detail.source]);

  useEffect(() => {
    if (!open) return;
    setKeyword('');
    setSelected(null);
    setParams([]);
    setChosen({});
    setParamKeysByEvent({});
    paramsCache.current.clear();
    fetchEvents('');
    return () => { searchId.current += 1; };
  }, [open, fetchEvents]);

  useEffect(() => {
    if (!selected) {
      setParams([]);
      setLoadingParams(false);
      return;
    }
    setParams([]);
    let cancelled = false;
    const loadParams = async () => {
      setLoadingParams(true);
      try {
        const cached = paramsCache.current.get(selected.recordId);
        const items = cached || (await getOfficialParams(selected.recordId)).items || [];
        paramsCache.current.set(selected.recordId, items);
        if (!cancelled) setParams(items);
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
    const batch = Object.values(chosen);
    if (!batch.length || saving) return;
    setSaving(true);
    let lastResult: ReuseOfficialEventResponse | undefined;
    let completed = 0;
    let imported = 0;
    try {
      // Keep writes sequential: the first event may fill the empty design record.
      // Parallel requests against that same record could overwrite one another.
      for (const event of batch) {
        setProgress(`正在复用 ${completed + 1}/${batch.length}`);
        const result = await reuseOfficialTrackingEvent(detail.recordId, {
          officialRecordId: event.recordId,
          officialParamKeys: paramKeysByEvent[event.recordId] || [],
          actorId,
          actorLarkId,
        });
        lastResult = result;
        completed += 1;
        imported += result.importedParamCount;
        setChosen((prev) => {
          const next = { ...prev };
          delete next[event.recordId];
          return next;
        });
      }
      toast.success(`已复用 ${completed} 个事件，导入 ${imported} 个参数`);
      onClose();
    } catch (error) {
      toast.error(`已完成 ${completed}/${batch.length} 个事件。${error instanceof Error ? error.message : '复用失败'}；未完成项已保留，请核对后重试`);
    } finally {
      setProgress('');
      setSaving(false);
      // Refresh once for the whole batch, including any partial success.
      if (lastResult) {
        try { await onReused(completed === batch.length ? lastResult : { ...lastResult, recordId: detail.recordId }); }
        catch { toast.error('事件已复用，但刷新失败，请重新打开需求单'); }
      }
    }
  };

  const toggleEvent = (event: OfficialEvent, checked: boolean) => {
    setChosen((prev) => {
      const next = { ...prev };
      if (checked) next[event.recordId] = event;
      else delete next[event.recordId];
      return next;
    });
    if (checked) setSelected(event);
  };

  const reuseTargetCopy = detail.evtId
    ? '当前事件已有 evt_id，将在同一需求下新增一条复用事件。'
    : '当前事件尚未填写 evt_id，将直接复用到当前设计记录。';

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !saving && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-lg border-border outline-none focus:outline-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-primary" />
            复用已有正式事件
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          复用 {detail.source === 'web' ? 'Web' : 'App'} 正式事件；参数默认不导入，仅复制勾选项。{reuseTargetCopy}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 rounded-md pl-8 text-xs"
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
                className="h-8 rounded-full"
                onClick={() => fetchEvents(keyword)}
                disabled={loading || saving}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                搜索
              </Button>
            </div>

            <div className="overflow-hidden rounded-2xl bg-muted/50 p-2">
              <div className="mb-1 flex items-center gap-2 px-2 text-xs text-muted-foreground">
                <ChecklistCheckbox label="全选已加载事件" disabled={saving || !events.length}
                  checked={events.length > 0 && events.every(event => Boolean(chosen[event.recordId]))}
                  mixed={events.some(event => Boolean(chosen[event.recordId])) && !events.every(event => Boolean(chosen[event.recordId]))}
                  onChange={checked => setChosen(previous => {
                    const next = { ...previous };
                    for (const event of events) { if (checked) next[event.recordId] = event; else delete next[event.recordId]; }
                    return next;
                  })} />
                <span>正式事件 · {events.length} 个</span>
                <span className="ml-auto">勾选复用 · 点击名称预览</span>
              </div>
              {loading && !events.length ? <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />正在加载正式事件...</div>
                : events.length ? <div className="max-h-[50vh] overflow-y-auto rounded-2xl">
                  <Checklist className="chk-checkbox-selection" label="可复用正式事件" activeId={selected?.recordId}
                    items={events.map(event => ({ id: event.recordId, label: event.evtId,
                      description: `${event.eventName} · ${event.version || '未标注版本'}`,
                      meta: <Badge variant="outline" className="border-0 bg-muted text-xs font-normal">{event.status || '-'}</Badge>,
                      checked: Boolean(chosen[event.recordId]), disabled: saving }))}
                    onToggle={(id, checked) => { const event = events.find(item => item.recordId === id); if (event) toggleEvent(event, checked); }}
                    onPreview={id => { const event = events.find(item => item.recordId === id); if (event) setSelected(event); }} />
                </div> : <div className="py-12 text-center text-sm text-muted-foreground">未找到正式事件</div>}
            </div>
            {pageToken && <Button variant="outline" size="sm" disabled={loading || saving} onClick={() => fetchEvents(submittedKeyword, pageToken)}>加载更多</Button>}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              已勾选 {Object.keys(chosen).length} 个事件（跨搜索保留）
              <button type="button" disabled={saving} onClick={() => setChosen({})}>清空事件选择</button>
              {Object.values(chosen).map((event) => <button key={event.recordId} type="button" disabled={saving} className="max-w-full truncate text-primary" onClick={() => setSelected(event)}>{event.evtId}</button>)}
            </div>
          </div>

          <div className="min-w-0 space-y-4 rounded-2xl bg-muted/50 p-4">
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
                <div className="overflow-hidden rounded-2xl bg-card">
                  <div className="px-4 py-3 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        可选正式参数 {loadingParams ? '' : `(${params.length})`} · 已选择 {selectedParamKeys.length} 个
                      </span>
                      {params.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => setSelectedParamKeys(params.map(paramKeyOf).filter(Boolean))}
                            disabled={saving}
                          >
                            全选
                          </button>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setSelectedParamKeys([])}
                            disabled={saving}
                          >
                            清空
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {loadingParams ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                        正在加载参数...
                      </div>
                    ) : params.length ? (
                      <Checklist className="chk-checkbox-selection" label="可导入正式参数" items={params.map(param => ({
                        id: paramKeyOf(param), label: param.paramKey || param.paramName || '',
                        description: `${param.paramType || '-'} · ${param.requiredRule || '非必传'}${param.enumRange ? ` · 枚举：${param.enumRange}` : ''}`,
                        checked: selectedParamKeys.includes(paramKeyOf(param)), disabled: saving,
                      }))} onToggle={(key, checked) => setSelectedParamKeys(checked ? [...selectedParamKeys, key] : selectedParamKeys.filter(value => value !== key))} />
                    ) : (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        该正式事件暂无参数明细
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-card py-12 text-center text-xs text-muted-foreground">
                请先从左侧选择一个正式事件
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-full"
            onClick={handleReuse}
            disabled={!Object.keys(chosen).length || saving}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
            {saving ? progress : `确认复用 ${Object.keys(chosen).length} 个事件`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function paramKeyOf(param: OfficialParam): string {
  return (param.paramKey || param.paramName || '').trim();
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
