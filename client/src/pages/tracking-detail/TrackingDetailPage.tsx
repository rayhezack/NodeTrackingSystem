import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { logger } from '@client/src/lib/logger';
import { useCurrentUser } from '@client/src/hooks/use-current-user';
import { ArrowLeft, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@client/src/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@client/src/components/ui/alert-dialog';
import { deleteTrackingRequest, getTrackingDetail, updateTrackingRecord } from '@client/src/api/tracking';
import type { RelatedTrackingEvent, TrackingDetail, TrackingDetailSnapshot, TrackingUserRef } from '@shared/api.interface';
import DetailHeader from './DetailHeader';
import ProcessFlowBar from './ProcessFlowBar';
import StageSidebar from './StageSidebar';
import StageForm, { serializeStageFields, getFieldValue, type StageDraft } from './StageForm';
import { buildStageUpdateRequest, toTrackingUserRefs } from './stage-form.utils';
import { SIDEBAR_STAGES, getCurrentUiNode } from './stage-config';
import { getCurrentActor } from '@client/src/utils/current-user';

const TrackingDetailPage = () => {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userProfile = useCurrentUser();
  const actor = getCurrentActor(userProfile);
  const requestedStage = searchParams.get('stage');

  const [detail, setDetail] = useState<TrackingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string>('requirement');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteRequestOpen, setDeleteRequestOpen] = useState(false);
  const [deletingRequest, setDeletingRequest] = useState(false);
  const detailCacheRef = useRef<Record<string, TrackingDetail>>({});
  const draftCacheRef = useRef<Record<string, StageDraft>>({});
  const [, setDraftVersion] = useState(0);
  const [savingDrafts, setSavingDrafts] = useState(false);
  const savingDraftsRef = useRef(false);
  const [uploadCount, setUploadCount] = useState(0);
  const draftStorageKey = `tracking-design-drafts:${actor.id || actor.larkId || 'anonymous'}`;
  const loadedDraftKey = useRef('');
  const pendingRecordIds = new Set([detail?.recordId, ...(detail?.relatedEvents || []).map((event) => event.recordId)]);
  const pendingDraftCount = Object.keys(draftCacheRef.current).filter((id) => pendingRecordIds.has(id)).length;

  useEffect(() => {
    if (loadedDraftKey.current === draftStorageKey) return;
    loadedDraftKey.current = draftStorageKey;
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(draftStorageKey) || '{}');
      draftCacheRef.current = stored && typeof stored === 'object' && !Array.isArray(stored)
        ? Object.fromEntries(Object.entries(stored).filter(([, draft]) => draft?.formData && typeof draft.formData === 'object' && !Array.isArray(draft.formData)))
        : {};
    } catch {
      draftCacheRef.current = {};
    }
    setDraftVersion((version) => version + 1);
  }, [draftStorageKey]);

  const persistDrafts = () => {
    try {
      sessionStorage.setItem(draftStorageKey, JSON.stringify(draftCacheRef.current));
    } catch {
      toast.warning('浏览器草稿缓存不可用，请在离开页面前保存');
    }
    setDraftVersion((version) => version + 1);
  };

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (Object.keys(draftCacheRef.current).length || uploadCount || savingDraftsRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploadCount]);

  const cacheKey = useCallback(
    (id: string) => `${actor.id || ''}|${actor.larkId || ''}|${id}`,
    [actor.id, actor.larkId],
  );

  const rememberDetailTree = useCallback((nextDetail: TrackingDetail): TrackingDetail => {
    const normalized = normalizeDetailForSelection(nextDetail, nextDetail.recordId);
    const relatedEvents = normalized.relatedEvents;
    const nextCache = { ...detailCacheRef.current };

    nextCache[cacheKey(normalized.recordId)] = normalized;
    for (const event of relatedEvents) {
      const eventDetail = detailFromRelatedEvent(event, relatedEvents);
      if (eventDetail) {
        nextCache[cacheKey(event.recordId)] = eventDetail;
      }
    }

    detailCacheRef.current = nextCache;
    return normalized;
  }, [cacheKey]);

  // 加载详情
  useEffect(() => {
    if (!recordId) return;

    let cancelled = false;
    const loadDetail = async () => {
      const cached = detailCacheRef.current[cacheKey(recordId)];
      if (cached) {
        setLoading(false);
        setError(null);
        const normalized = normalizeDetailForSelection(cached, recordId);
        setDetail(normalized);
        const normalizedRequestedStage = requestedStage === 'params' ? 'design' : requestedStage;
        const matchedStage =
          SIDEBAR_STAGES.find((s) => s.id === normalizedRequestedStage) ||
            getActiveSidebarStage(normalized);
        if (matchedStage?.id) {
          setActiveStage(matchedStage.id);
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await getTrackingDetail(recordId, actor.id, actor.larkId);
        if (cancelled) return;
        const normalized = rememberDetailTree(res.data);
        setDetail(normalized);

        const normalizedRequestedStage = requestedStage === 'params' ? 'design' : requestedStage;
        const matchedStage =
          SIDEBAR_STAGES.find((s) => s.id === normalizedRequestedStage) ||
            getActiveSidebarStage(normalized);
        if (matchedStage?.id) {
          setActiveStage(matchedStage.id);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '加载失败';
        setError(msg);
        logger.error('加载需求详情失败', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDetail();
    return () => {
      cancelled = true;
    };
    // requestedStage 仅用于首次从「新增需求」跳转到参数设计；
    // 后续侧边栏切换不应触发详情重载并覆盖用户当前选择。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, actor.id, actor.larkId, cacheKey, rememberDetailTree]);

  // 流程节点点击 → 跳转到对应侧边栏阶段
  const handleNodeClick = (nodeKey: string) => {
    if (savingDraftsRef.current) return;
    const matchedStage = SIDEBAR_STAGES.find((s) => s.uiNode === nodeKey);
    if (matchedStage) {
      setActiveStage(matchedStage.id);
      setSearchParams({});
    }
  };

  // 完成节点 / 新增事件 / 删除事件后刷新
  const handleSaved = async (nextRecordId?: string) => {
    const targetRecordId = nextRecordId || detail?.recordId || recordId;
    if (!targetRecordId) return;
    try {
      const res = await getTrackingDetail(targetRecordId, actor.id, actor.larkId);
      const normalized = rememberDetailTree(res.data);
      const remainingIds = new Set([normalized.recordId, ...normalized.relatedEvents.map((event) => event.recordId)]);
      for (const id of pendingRecordIds) {
        if (id && !remainingIds.has(id)) delete draftCacheRef.current[id];
      }
      persistDrafts();
      setDetail(normalized);
      const matchedStage = getActiveSidebarStage(normalized);
      if (matchedStage) {
        setActiveStage(matchedStage.id);
      }
      if (targetRecordId !== recordId) {
        navigate(`/tracking/${targetRecordId}?stage=design`, { replace: true });
      }
    } catch (err) {
      logger.error('刷新详情失败', err);
    }
  };

  const handleLocalSavedPatch = (fields: Record<string, unknown>, currentStage: string) => {
    setDetail((prev) => {
      if (!prev) return prev;
      const patched = patchTrackingDetail(prev, activeStage, fields, currentStage);
      return rememberDetailTree(patched);
    });
  };

  const handleDraftChange = (targetRecordId: string, key: string, value: string | unknown[]) => {
    const existing = draftCacheRef.current[targetRecordId];
    draftCacheRef.current[targetRecordId] = { formData: { ...existing?.formData, [key]: value } };
    persistDrafts();
  };

  const handleSaveAllDrafts = async () => {
    if (savingDraftsRef.current || uploadCount) throw new Error('请等待图片上传或保存完成');
    const pending = Object.entries(draftCacheRef.current).filter(([id]) => pendingRecordIds.has(id));
    if (!pending.length) return;
    savingDraftsRef.current = true;
    setSavingDrafts(true);
    let savedCount = 0;
    try {
      const config = SIDEBAR_STAGES.find((stage) => stage.id === 'design')!;
      // Validate every draft before making the first write.
      const requests = pending.map(([id, draft]) => {
        const target = detailCacheRef.current[cacheKey(id)];
        if (!target) throw new Error(`无法读取埋点 ${id}，请重新打开后保存`);
        if (!target.permissions.canEditDesign) throw new Error(`无权编辑埋点 ${target.evtId || id}`);
        const values = { ...Object.fromEntries(config.fields.map((field) => [field.key, getFieldValue(target, field)])), ...draft.formData };
        const dirty = new Set(config.fields.filter((field) => Object.prototype.hasOwnProperty.call(draft.formData, field.key)).map((field) => field.baseField));
        try {
          const fields = serializeStageFields(config, values, dirty);
          const localFields = Object.fromEntries(config.fields.filter((field) => dirty.has(field.baseField)).map((field) => [field.baseField, values[field.key]]));
          return { id, request: buildStageUpdateRequest('design', fields, dirty), localFields };
        } catch (error) {
          throw new Error(`${target.evtId || target.eventName || id}：${error instanceof Error ? error.message : '校验失败'}`);
        }
      });
      for (const { id, request, localFields } of requests) {
        const response = await updateTrackingRecord(id, { ...request, actorId: actor.id, actorLarkId: actor.larkId });
        const target = detailCacheRef.current[cacheKey(id)];
        rememberDetailTree(patchTrackingDetail(target, 'design', localFields, response.currentStage));
        delete draftCacheRef.current[id];
        savedCount += 1;
        persistDrafts();
      }
      toast.success(`已保存 ${savedCount} 个埋点的修改`);
    } catch (error) {
      throw new Error(`已保存 ${savedCount}/${pending.length} 个埋点，其余草稿已保留。${error instanceof Error ? error.message : '保存失败'}`);
    } finally {
      const selected = detail && detailCacheRef.current[cacheKey(detail.recordId)];
      if (selected) setDetail(normalizeDetailForSelection(selected, selected.recordId));
      savingDraftsRef.current = false;
      setSavingDrafts(false);
    }
  };

  const handleRelatedEventSelect = (nextRecordId: string) => {
    if (savingDraftsRef.current) return;
    const cached = detailCacheRef.current[cacheKey(nextRecordId)];
    if (cached) {
      const normalized = normalizeDetailForSelection(cached, nextRecordId);
      setDetail(normalized);
      setActiveStage('design');
      navigate(`/tracking/${nextRecordId}?stage=design`, { replace: true });
      return;
    }
    navigate(`/tracking/${nextRecordId}?stage=design`);
  };

  const handleBack = () => {
    if (savingDraftsRef.current) return;
    if (pendingDraftCount || uploadCount) {
      setLeaveOpen(true);
      return;
    }
    navigate('/');
  };

  const handleDeleteRequest = async () => {
    if (!detail || deletingRequest || savingDraftsRef.current || uploadCount) return;
    setDeletingRequest(true);
    try {
      const result = await deleteTrackingRequest(detail.recordId, {
        actorId: actor.id,
        actorLarkId: actor.larkId,
      });
      toast.success(`需求单已删除：${result.deletedRecordCount} 个事件、${result.deletedParamCount} 个参数`);
      detailCacheRef.current = {};
      for (const id of pendingRecordIds) if (id) delete draftCacheRef.current[id];
      persistDrafts();
      setDeleteRequestOpen(false);
      navigate('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除需求单失败';
      toast.error(msg);
    } finally {
      setDeletingRequest(false);
    }
  };

  // 骨架屏
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-sm h-8" disabled>
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        </div>
        <div className="overflow-hidden rounded-sm border border-border bg-card">
          <div className="h-20 animate-pulse bg-muted/30" />
          <div className="h-16 border-t border-border animate-pulse bg-muted/20" />
          <div className="flex min-h-[500px]">
            <div className="w-[200px] border-r border-border animate-pulse bg-muted/10" />
            <div className="flex-1 p-6">
              <div className="space-y-4">
                <div className="h-6 w-32 animate-pulse bg-muted/30 rounded-sm" />
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-3 w-16 animate-pulse bg-muted/30 rounded-sm" />
                      <div className="h-8 w-full animate-pulse bg-muted/20 rounded-sm" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error || !detail) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-sm h-8"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center rounded-sm border border-border bg-card py-20">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <p className="text-sm font-medium text-foreground">加载失败</p>
          <p className="mt-1 text-xs text-muted-foreground">{error || '记录不存在'}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 rounded-sm"
            onClick={() => recordId && window.location.reload()}
          >
            重试
          </Button>
        </div>
      </div>
    );
  }

  const officialStatus = fieldText(detail.archiveFields['正式状态']);
  const currentUiNode = getCurrentUiNode(
    detail.stage,
    detail.reviewStatus,
    officialStatus,
  );
  const canDeleteRequest = detail.permissions.canEditRequirement || detail.permissions.canEditDesign || detail.permissions.canEditArchive;

  return (
    <div className="space-y-4">
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>仍有未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>
              {uploadCount > 0 ? '图片正在上传，请等待上传完成再离开。' : '确定返回列表？草稿会保留在当前浏览器标签页，关闭标签页前请完成保存。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm">继续编辑</AlertDialogCancel>
            <AlertDialogAction disabled={uploadCount > 0} className="rounded-sm" onClick={() => navigate('/')}>
              返回列表
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* 返回按钮 */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-sm h-8"
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Button>
        {canDeleteRequest && (
          <AlertDialog open={deleteRequestOpen} onOpenChange={setDeleteRequestOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-sm border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deletingRequest || savingDrafts || uploadCount > 0}
              >
                {deletingRequest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                删除需求单
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-sm">
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除整个需求单？</AlertDialogTitle>
                <AlertDialogDescription>
                  将删除「{detail.requestName || detail.eventName || detail.evtId}」下的所有埋点事件和设计参数；不会删除正式查询库。已上线、已归档或已废弃的需求会被后端拒绝。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-sm" disabled={deletingRequest || savingDrafts || uploadCount > 0}>
                  取消
                </AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deletingRequest || savingDrafts || uploadCount > 0}
                  onClick={(event) => {
                    event.preventDefault();
                    void handleDeleteRequest();
                  }}
                >
                  {deletingRequest && <Loader2 className="h-4 w-4 animate-spin" />}
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* 详情卡片 */}
      <div className="min-w-0 max-w-full overflow-hidden rounded-sm bg-card shadow-none">
        {/* 顶部信息栏 */}
        <DetailHeader detail={detail} />

        {/* 流程条 */}
        <ProcessFlowBar
          baseStage={detail.stage}
          reviewStatus={detail.reviewStatus}
          officialStatus={officialStatus}
          onNodeClick={handleNodeClick}
        />

        {/* 左右分栏 */}
        <div className="flex flex-col md:flex-row">
          {/* 左侧阶段导航 */}
          <StageSidebar
            activeStage={activeStage}
            permissions={detail.permissions}
            onStageChange={(stage) => {
              if (savingDraftsRef.current) return;
              setActiveStage(stage);
              setSearchParams({});
            }}
          />

          {/* 右侧内容区 */}
          <div className="min-h-[500px] min-w-0 flex-1 border-t border-border/60 p-6 md:border-t-0 md:border-l md:border-border/60">
            <StageForm
              key={`${activeStage}-${detail.recordId}`}
              stageId={activeStage}
              detail={detail}
              canEdit={
                detail.permissions[
                  SIDEBAR_STAGES.find((s) => s.id === activeStage)
                    ?.permissionKey || 'canEditRequirement'
                ]
              }
              actorId={actor.id}
              actorLarkId={actor.larkId}
              onSaved={handleSaved}
              onArchiveCompleted={() => navigate('/', { replace: true })}
              onSavedPatch={handleLocalSavedPatch}
              onSelectEvent={handleRelatedEventSelect}
              onRelatedEventsChanged={handleSaved}
              draft={activeStage === 'design' ? draftCacheRef.current[detail.recordId] : undefined}
              onDraftChange={(key, value) => handleDraftChange(detail.recordId, key, value)}
              pendingDraftCount={pendingDraftCount}
              onSaveAllDrafts={handleSaveAllDrafts}
              draftsBusy={savingDrafts || uploadCount > 0}
              onUploadStateChange={(uploading) => setUploadCount((count) => Math.max(0, count + (uploading ? 1 : -1)))}
            />
          </div>
        </div>
      </div>

      {/* 当前阶段标识（调试用，可移除） */}
      <div className="text-xs text-muted-foreground hidden">
        当前 UI 节点: {currentUiNode} | Base 阶段: {detail.stage}
      </div>
    </div>
  );
};

export default TrackingDetailPage;

function getActiveSidebarStage(detail: TrackingDetail) {
  const uiNode = getCurrentUiNode(
    detail.stage,
    detail.reviewStatus,
    fieldText(detail.archiveFields['正式状态']),
  );
  return SIDEBAR_STAGES.find((stage) => stage.uiNode === uiNode);
}

function normalizeDetailForSelection(detail: TrackingDetail, currentRecordId: string): TrackingDetail {
  const existingEvents = detail.relatedEvents?.length
    ? detail.relatedEvents
    : [eventSummaryFromDetail(detail)];
  const relatedEvents = existingEvents.map((event) => {
    const snapshot = event.recordId === detail.recordId
      ? toDetailSnapshot(detail)
      : event.detail;
    return {
      ...event,
      isCurrent: event.recordId === currentRecordId,
      ...(snapshot ? { detail: snapshot } : {}),
    };
  });

  return {
    ...detail,
    relatedEvents,
  };
}

function detailFromRelatedEvent(
  event: RelatedTrackingEvent,
  relatedEvents: RelatedTrackingEvent[],
): TrackingDetail | null {
  if (!event.detail) return null;
  return normalizeDetailForSelection(
    {
      ...event.detail,
      relatedEvents,
    },
    event.recordId,
  );
}

function eventSummaryFromDetail(detail: TrackingDetail): RelatedTrackingEvent {
  return {
    recordId: detail.recordId,
    source: detail.source,
    evtId: detail.evtId,
    eventName: detail.eventName,
    stage: detail.stage,
    uiStage: detail.uiStage,
    priority: detail.priority,
    platform: detail.platform,
    isCurrent: true,
    detail: toDetailSnapshot(detail),
  };
}

function toDetailSnapshot(detail: TrackingDetail): TrackingDetailSnapshot {
  const { relatedEvents: _relatedEvents, ...snapshot } = detail;
  return snapshot;
}

function patchTrackingDetail(
  detail: TrackingDetail,
  activeStage: string,
  fields: Record<string, unknown>,
  currentStage: string,
): TrackingDetail {
  const groupKey = fieldGroupForStage(activeStage);
  const next: TrackingDetail = {
    ...detail,
    stage: currentStage || detail.stage,
    requirementFields: { ...detail.requirementFields },
    designFields: { ...detail.designFields },
    reviewFields: { ...detail.reviewFields },
    devFields: { ...detail.devFields },
    acceptanceFields: { ...detail.acceptanceFields },
    launchFields: { ...detail.launchFields },
    archiveFields: { ...detail.archiveFields },
  };

  for (const [fieldName, value] of Object.entries(fields)) {
    for (const fieldGroup of DETAIL_FIELD_GROUPS) {
      if (
        fieldGroup === groupKey ||
        Object.prototype.hasOwnProperty.call(next[fieldGroup], fieldName)
      ) {
        next[fieldGroup] = {
          ...next[fieldGroup],
          [fieldName]: value,
        };
      }
    }
    applyTopLevelField(next, fieldName, value);
  }

  next.uiStage = getCurrentUiNode(
    next.stage,
    next.reviewStatus,
    fieldText(next.archiveFields['正式状态']),
  );

  const patchedSnapshot = toDetailSnapshot(next);
  const sharedFields = pickRequestSharedFields(fields);
  const shouldSyncSharedFields = Object.keys(sharedFields).length > 0;
  next.relatedEvents = (next.relatedEvents?.length ? next.relatedEvents : [eventSummaryFromDetail(next)])
    .map((event) => {
      if (event.recordId === next.recordId) {
        return {
          ...event,
          evtId: next.evtId,
          eventName: next.eventName,
          stage: next.stage,
          uiStage: next.uiStage,
          priority: next.priority,
          platform: next.platform,
          isCurrent: true,
          detail: patchedSnapshot,
        };
      }
      if (shouldSyncSharedFields && event.detail) {
        const syncedDetail = patchRequestSharedFields(event.detail, sharedFields);
        return {
          ...event,
          detail: syncedDetail,
        };
      }
      return {
        ...event,
        isCurrent: false,
      };
    });

  return next;
}

const DETAIL_FIELD_GROUPS = [
  'requirementFields',
  'designFields',
  'reviewFields',
  'devFields',
  'acceptanceFields',
  'launchFields',
  'archiveFields',
] as const;

const REQUEST_SHARED_FIELD_NAMES = new Set(['需求名称', '期望完成日期', '需求提出人', '需求录入人', '数据负责人', '研发负责人', 'DS验收人']);

function fieldGroupForStage(stageId: string): typeof DETAIL_FIELD_GROUPS[number] | null {
  const map: Record<string, typeof DETAIL_FIELD_GROUPS[number]> = {
    requirement: 'requirementFields',
    design: 'designFields',
    review: 'reviewFields',
    dev: 'devFields',
    acceptance: 'acceptanceFields',
    launch: 'launchFields',
    archive: 'archiveFields',
  };
  return map[stageId] || null;
}

function pickRequestSharedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([fieldName]) => REQUEST_SHARED_FIELD_NAMES.has(fieldName)),
  );
}

function patchRequestSharedFields(
  detail: TrackingDetailSnapshot,
  fields: Record<string, unknown>,
): TrackingDetailSnapshot {
  const next: TrackingDetailSnapshot = {
    ...detail,
    requirementFields: { ...detail.requirementFields },
    devFields: { ...detail.devFields },
    acceptanceFields: { ...detail.acceptanceFields },
  };

  for (const [fieldName, value] of Object.entries(fields)) {
    for (const fieldGroup of DETAIL_FIELD_GROUPS) {
      if (Object.prototype.hasOwnProperty.call(next[fieldGroup], fieldName)) {
        next[fieldGroup] = {
          ...next[fieldGroup],
          [fieldName]: value,
        };
      }
    }
    applyTopLevelField(next, fieldName, value);
  }

  return next;
}

function applyTopLevelField(detail: TrackingDetail | TrackingDetailSnapshot, fieldName: string, value: unknown) {
  switch (fieldName) {
    case '需求名称':
      detail.requestName = displayText(value);
      break;
    case 'evt_id':
      detail.evtId = displayText(value);
      break;
    case '事件中文名':
      detail.eventName = displayText(value);
      break;
    case '优先级':
      detail.priority = displayText(value) || detail.priority;
      break;
    case '端':
      detail.platform = displayText(value) || detail.platform;
      break;
    case '评审状态':
      detail.reviewStatus = displayText(value);
      break;
    case '埋点开发状态':
      detail.devStatus = displayText(value);
      break;
    case 'DS验收状态':
      detail.acceptanceStatus = displayText(value);
      break;
    case '需求提出人':
      applyUserRefs(detail, 'requester', 'requesterIds', value);
      break;
    case '需求录入人':
      applyUserRefs(detail, 'recorder', 'recorderIds', value);
      break;
    case '数据负责人':
      applyUserRefs(detail, 'dataOwner', 'dataOwnerIds', value);
      break;
    case '研发负责人':
      applyUserRefs(detail, 'devOwner', 'devOwnerIds', value);
      break;
    case 'DS验收人':
      applyUserRefs(detail, 'dsAcceptor', 'dsAcceptorIds', value);
      break;
    default:
      break;
  }
}

function applyUserRefs(
  detail: TrackingDetail | TrackingDetailSnapshot,
  userKey: 'requester' | 'recorder' | 'dataOwner' | 'devOwner' | 'dsAcceptor',
  idsKey: 'requesterIds' | 'recorderIds' | 'dataOwnerIds' | 'devOwnerIds' | 'dsAcceptorIds',
  value: unknown,
) {
  const users = toTrackingUserRefs(value);
  detail[userKey] = users;
  detail[idsKey] = users.map((user) => user.user_id);
}

function displayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(displayText).filter(Boolean).join('、');
  }
  if (value && typeof value === 'object') {
    const user = value as Partial<TrackingUserRef> & { text?: unknown; name?: unknown };
    return displayText(user.name || user.text || user.user_id || '');
  }
  return '';
}

function fieldText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
