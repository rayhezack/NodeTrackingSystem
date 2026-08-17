import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  FileCheck2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Checkbox } from '@client/src/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import {
  applyAiTrackingDraft,
  generateAiTrackingDraft,
  getAiFeishuAuthStatus,
  getAiTrackingConfig,
  startAiFeishuAuth,
} from '@client/src/api/tracking';
import type {
  AiFeishuAuthStatus,
  AiTrackingConfigStatus,
  AiTrackingDraft,
  TrackingDetail,
} from '@shared/api.interface';

interface AiTrackingDraftPanelProps {
  detail: TrackingDetail;
  canEdit: boolean;
  actorId?: string;
  actorLarkId?: string;
  onApplied?: (recordId?: string) => void | Promise<void>;
}

const AiTrackingDraftPanel = ({
  detail,
  canEdit,
  actorId,
  actorLarkId,
  onApplied,
}: AiTrackingDraftPanelProps) => {
  const [config, setConfig] = useState<AiTrackingConfigStatus | null>(null);
  const [auth, setAuth] = useState<AiFeishuAuthStatus | null>(null);
  const [authUrl, setAuthUrl] = useState('');
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [draft, setDraft] = useState<AiTrackingDraft | null>(null);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const refreshStatus = useCallback(async () => {
    const [nextConfig, nextAuth] = await Promise.all([
      getAiTrackingConfig(),
      getAiFeishuAuthStatus(actorId, actorLarkId),
    ]);
    setConfig(nextConfig);
    setAuth(nextAuth);
    return nextAuth;
  }, [actorId, actorLarkId]);

  useEffect(() => {
    void refreshStatus().catch(() => undefined);
  }, [refreshStatus]);

  useEffect(() => {
    if (!authUrl || auth?.authorized || !authDialogOpen) return;
    const interval = window.setInterval(() => {
      void refreshStatus().then((status) => {
        if (status.authorized) {
          setAuthDialogOpen(false);
          setAuthUrl('');
          toast.success('飞书文档已授权');
        }
      }).catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [authUrl, auth?.authorized, authDialogOpen, refreshStatus]);

  const handleAuthorize = async () => {
    try {
      const result = await startAiFeishuAuth({
        recordId: detail.recordId,
        actorId,
        actorLarkId,
      });
      setAuthUrl(result.authorizationUrl);
      setAuthDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法发起飞书授权');
    }
  };

  const handleGenerate = async () => {
    if (!auth?.authorized) {
      await handleAuthorize();
      return;
    }
    setLoading(true);
    try {
      const result = await generateAiTrackingDraft(detail.recordId, { actorId, actorLarkId });
      setDraft(result.draft);
      setSelectedIds(new Set(result.draft.events.map((event) => event.clientId)));
      setDraftDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI 埋点草稿生成失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!draft || !selectedIds.size) return;
    setApplying(true);
    try {
      const result = await applyAiTrackingDraft(detail.recordId, draft.id, {
        actorId,
        actorLarkId,
        selectedEventClientIds: Array.from(selectedIds),
      });
      toast.success(`已写入 ${result.createdEventCount} 个事件、${result.createdParamCount} 个参数`);
      setDraftDialogOpen(false);
      await onApplied?.(result.appliedRecordIds[0]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI 草稿应用失败');
    } finally {
      setApplying(false);
    }
  };

  const requirementLink = String(detail.requirementFields['需求链接'] || '').trim();
  const ready = Boolean(config?.configured && config.feishuOAuthConfigured);

  return (
    <>
      <div className="border-y border-border bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">AI 埋点初稿</span>
                {config && (
                  <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px] font-normal">
                    {config.provider} / {config.model}
                  </Badge>
                )}
                {auth?.authorized && (
                  <Badge variant="outline" className="h-5 rounded-sm border-emerald-200 px-1.5 text-[10px] font-normal text-emerald-700">
                    <ShieldCheck className="mr-1 h-3 w-3" />已授权
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {requirementLink || '当前需求缺少 PRD 链接'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!auth?.authorized && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-sm"
                disabled={!canEdit || !config?.feishuOAuthConfigured}
                onClick={() => void handleAuthorize()}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                授权文档
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-sm"
              disabled={!canEdit || !ready || !requirementLink || loading}
              onClick={() => void handleGenerate()}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {loading ? '生成中...' : draft ? '生成新版' : '生成初稿'}
            </Button>
          </div>
        </div>
        {config && !ready && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
            <TriangleAlert className="h-3.5 w-3.5" />
            <span>
              当前运行环境缺少：{config.missingKeys.join('、') || '未知配置'}。
              {window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
                ? ' 本地调试需写入 .env.local 并重启服务；妙搭静态配置仅对部署环境生效。'
                : ' 请检查妙搭静态配置并重启服务。'}
            </span>
          </div>
        )}
      </div>

      <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <DialogContent className="max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="text-base">飞书文档授权</DialogTitle>
            <DialogDescription>请使用飞书扫码授权，仅用于读取当前账号可访问的 PRD 正文。</DialogDescription>
          </DialogHeader>
          {authUrl && (
            <div className="flex flex-col items-center gap-3 py-3">
              <div className="border border-border bg-white p-3">
                <QRCodeSVG value={authUrl} size={176} title="飞书文档授权二维码" />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                等待扫码授权
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
        <DialogContent className="max-h-[88vh] max-w-5xl overflow-hidden rounded-sm p-0">
          {draft && (
            <>
              <DialogHeader className="border-b border-border px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-base">AI 埋点草稿 v{draft.version}</DialogTitle>
                  <Badge variant="outline" className="rounded-sm text-[10px]">{draft.events.length} 个事件</Badge>
                  <Badge variant="outline" className="rounded-sm text-[10px]">{draft.model}</Badge>
                </div>
                <DialogDescription>{draft.summary}</DialogDescription>
              </DialogHeader>

              <div className="max-h-[calc(88vh-150px)] overflow-y-auto px-5 py-4">
                {draft.analystQuestions.length > 0 && (
                  <div className="mb-4 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <div className="mb-1 font-medium">待人工确认</div>
                    {draft.analystQuestions.map((question) => <div key={question}>- {question}</div>)}
                  </div>
                )}

                <div className="space-y-4">
                  {draft.events.map((event, index) => {
                    const diff = draft.diffs.find((item) => item.eventClientId === event.clientId);
                    return (
                      <section key={event.clientId} className="border border-border bg-card">
                        <div className="flex items-start gap-3 border-b border-border px-3 py-3">
                          <Checkbox
                            checked={selectedIds.has(event.clientId)}
                            onCheckedChange={(checked) => setSelectedIds((previous) => {
                              const next = new Set(previous);
                              if (checked) next.add(event.clientId); else next.delete(event.clientId);
                              return next;
                            })}
                            aria-label={`选择 ${event.evtId}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-medium text-foreground">{event.evtId}</span>
                              <span className="text-xs text-muted-foreground">{event.eventName}</span>
                              <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                                {diff?.scope === 'current_event' ? '填充当前事件' : '新增事件'}
                              </Badge>
                              {event.reuseSource && (
                                <Badge variant="outline" className="h-5 rounded-sm border-blue-200 px-1.5 text-[10px] text-blue-700">
                                  复用 {event.reuseSource.evtId}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-foreground">{event.triggerTiming}</div>
                          </div>
                          <span className="text-xs text-muted-foreground">#{index + 1}</span>
                        </div>

                        <div className="grid gap-px bg-border md:grid-cols-3">
                          <Spec label="事件定义" value={event.eventDefinition} />
                          <Spec label="指标/场景" value={event.metricScenario} />
                          <Spec label="端 / 处理方" value={`${event.platform} / ${event.handler}`} />
                        </div>

                        {event.reuseSource && (
                          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                            复用来源：{event.reuseSource.eventName}；{event.reuseSource.modificationSummary}
                          </div>
                        )}

                        {diff && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                            <span>变化字段：{diff.changedFields.join('、') || '无'}</span>
                            <span>新增参数：{diff.addedParamNames.join('、') || '无'}</span>
                            <span>修改参数：{diff.changedParamNames.join('、') || '无'}</span>
                          </div>
                        )}

                        <div className="overflow-x-auto border-t border-border">
                          <table className="w-full min-w-[760px] text-left text-xs">
                            <thead className="bg-muted/40 text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2 font-medium">参数名</th>
                                <th className="px-3 py-2 font-medium">类型</th>
                                <th className="px-3 py-2 font-medium">必传</th>
                                <th className="px-3 py-2 font-medium">定义</th>
                                <th className="px-3 py-2 font-medium">枚举/范围</th>
                                <th className="px-3 py-2 font-medium">来源</th>
                              </tr>
                            </thead>
                            <tbody>
                              {event.params.map((param) => (
                                <tr key={param.paramName} className="border-t border-border align-top">
                                  <td className="px-3 py-2 font-mono">{param.paramName}</td>
                                  <td className="px-3 py-2">{param.paramType}</td>
                                  <td className="px-3 py-2">{param.requiredRule}</td>
                                  <td className="max-w-64 px-3 py-2">{param.definition}</td>
                                  <td className="max-w-64 whitespace-pre-wrap px-3 py-2">{param.enumRange || '-'}</td>
                                  <td className="px-3 py-2">{param.source === 'ai' ? 'AI新增' : param.source === 'official' ? '正式库' : '正式库修改'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {(event.evidence.length > 0 || event.uncertainties.length > 0) && (
                          <div className="grid gap-3 border-t border-border px-3 py-2 md:grid-cols-2">
                            <Evidence title="PRD 依据" items={event.evidence} />
                            <Evidence title="待确认" items={event.uncertainties} warning />
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="border-t border-border px-5 py-3">
                <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
                  <FileCheck2 className="h-4 w-4" />
                  已选择 {selectedIds.size} / {draft.events.length}
                </div>
                <Button type="button" variant="outline" className="rounded-sm" disabled={loading || applying} onClick={() => void handleGenerate()}>
                  <RefreshCw className="h-4 w-4" />生成新版
                </Button>
                <Button type="button" className="rounded-sm" disabled={!selectedIds.size || applying} onClick={() => void handleApply()}>
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {applying ? '应用中...' : '应用到需求单'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AiTrackingDraftPanel;

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-xs text-foreground">{value || '-'}</div>
    </div>
  );
}

function Evidence({ title, items, warning = false }: { title: string; items: string[]; warning?: boolean }) {
  if (!items.length) return null;
  return (
    <div className={warning ? 'text-amber-800' : 'text-muted-foreground'}>
      <div className="mb-1 text-[10px] font-medium">{title}</div>
      {items.map((item) => <div key={item} className="text-xs">- {item}</div>)}
    </div>
  );
}
