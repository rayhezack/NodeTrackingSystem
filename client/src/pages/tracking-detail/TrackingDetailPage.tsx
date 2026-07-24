import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { getTrackingDetail } from '@client/src/api/tracking';
import type { TrackingDetail } from '@shared/api.interface';
import DetailHeader from './DetailHeader';
import ProcessFlowBar from './ProcessFlowBar';
import StageSidebar from './StageSidebar';
import StageForm from './StageForm';
import { SIDEBAR_STAGES, getCurrentUiNode } from './stage-config';
import { getCurrentActor } from '@client/src/utils/current-user';

const TrackingDetailPage = () => {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userProfile = useCurrentUserProfile();
  const actor = getCurrentActor(userProfile);
  const requestedStage = searchParams.get('stage');

  const [detail, setDetail] = useState<TrackingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string>('requirement');

  // 加载详情
  useEffect(() => {
    if (!recordId) return;

    let cancelled = false;
    const loadDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getTrackingDetail(recordId, actor.id, actor.larkId);
        if (cancelled) return;
        setDetail(res.data);

        const normalizedRequestedStage = requestedStage === 'params' ? 'design' : requestedStage;
        const matchedStage =
          SIDEBAR_STAGES.find((s) => s.id === normalizedRequestedStage) ||
            getActiveSidebarStage(res.data);
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
  }, [recordId, actor.id, actor.larkId]);

  // 流程节点点击 → 跳转到对应侧边栏阶段
  const handleNodeClick = (nodeKey: string) => {
    const matchedStage = SIDEBAR_STAGES.find((s) => s.uiNode === nodeKey);
    if (matchedStage) {
      setActiveStage(matchedStage.id);
      setSearchParams({});
    }
  };

  // 保存后刷新
  const handleSaved = async () => {
    if (!recordId) return;
    try {
      const res = await getTrackingDetail(recordId, actor.id, actor.larkId);
      setDetail(res.data);
      const matchedStage = getActiveSidebarStage(res.data);
      if (matchedStage) {
        setActiveStage(matchedStage.id);
      }
    } catch (err) {
      logger.error('刷新详情失败', err);
    }
  };

  const handleBack = () => {
    navigate('/');
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

  return (
    <div className="space-y-4">
      {/* 返回按钮 */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-sm h-8"
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Button>
      </div>

      {/* 详情卡片 */}
      <div className="overflow-hidden rounded-sm border border-border bg-card shadow-none">
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
              setActiveStage(stage);
              setSearchParams({});
            }}
          />

          {/* 右侧内容区 */}
          <div className="flex-1 border-t border-border md:border-t-0 md:border-l border-border p-6 min-h-[500px]">
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
              onSaved={handleSaved}
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

function fieldText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
