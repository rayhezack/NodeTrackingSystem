import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { Plus } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';

import StageStats from './StageStats';
import MyTodos from './MyTodos';
import RecordsTable from './RecordsTable';
import NewTrackingRequestDialog from './NewTrackingRequestDialog';

import * as trackingApi from '@client/src/api/tracking';
import { getCurrentActor } from '@client/src/utils/current-user';
import type {
  CreateTrackingRecordRequest,
  StageStat,
  TodoItem,
  TrackingRecord,
  TrackingSourceFilter,
} from '@shared/api.interface';

const WorkbenchPage = () => {
  const navigate = useNavigate();
  const userProfile = useCurrentUserProfile();
  const actor = getCurrentActor(userProfile);
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate = Boolean(actor.id || actor.larkId);

  // 阶段统计
  const [stats, setStats] = useState<StageStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // 我的待办
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todosLoading, setTodosLoading] = useState(true);
  const [todosError, setTodosError] = useState<string | null>(null);

  // 需求列表
  const [records, setRecords] = useState<TrackingRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // 筛选条件
  const [keyword, setKeyword] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<string>('');

  // 首屏聚合加载：统计、待办、列表共用一次后端 Base 读取，避免重复扫表。
  const loadDashboard = useCallback(async () => {
    const { source, platform } = normalizePlatformFilter(platformFilter);
    setStatsLoading(true);
    setTodosLoading(true);
    setRecordsLoading(true);
    setStatsError(null);
    setTodosError(null);
    setRecordsError(null);
    try {
      const res = await trackingApi.getWorkbenchDashboard({
        source,
        keyword: keyword || undefined,
        stage: stageFilter || undefined,
        priority: priorityFilter || undefined,
        platform,
        pageSize: 20,
        todoLimit: 10,
        actorId: actor.id,
        actorLarkId: actor.larkId,
      });
      setStats(res.stats);
      setTodos(res.todos);
      setRecords(res.items);
      setHasMore(res.hasMore);
      setPageToken(res.pageToken);
      setTotal(res.total);
    } catch (err) {
      logger.error('加载工作台数据失败', err);
      const message = err instanceof Error ? err.message : '加载失败';
      setStatsError(message);
      setTodosError(message);
      setRecordsError(message);
    } finally {
      setStatsLoading(false);
      setTodosLoading(false);
      setRecordsLoading(false);
      setLoadingMore(false);
    }
  }, [actor.id, actor.larkId, keyword, stageFilter, priorityFilter, platformFilter]);

  // 加载更多只追加列表，避免刷新统计/待办。
  const loadMoreRecords = useCallback(
    async () => {
      const { source, platform } = normalizePlatformFilter(platformFilter);
      setLoadingMore(true);
      setRecordsError(null);
      try {
        const res = await trackingApi.getTrackingRecords({
          source,
          keyword: keyword || undefined,
          stage: stageFilter || undefined,
          priority: priorityFilter || undefined,
          platform,
          pageSize: 20,
          pageToken,
        });
        setRecords((prev) => [...prev, ...res.items]);
        setHasMore(res.hasMore);
        setPageToken(res.pageToken);
        setTotal(res.total);
      } catch (err) {
        logger.error('加载更多需求失败', err);
        setRecordsError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoadingMore(false);
      }
    },
    [keyword, stageFilter, priorityFilter, platformFilter, pageToken],
  );

  // 初始加载
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // 点击阶段卡片筛选
  const handleStageClick = (stage: string) => {
    setStageFilter(stageFilter === stage ? '' : stage);
  };

  // 跳转详情
  const goToDetail = (recordId: string, targetStage?: string) => {
    navigate(`/tracking/${recordId}${targetStage ? `?stage=${targetStage}` : ''}`);
  };

  const handleCreate = async (data: CreateTrackingRecordRequest) => {
    const res = await trackingApi.createTrackingRecord(data);
    await loadDashboard();
    navigate(`/tracking/${res.recordId}`);
  };

  // 重置筛选
  const handleReset = () => {
    setKeyword('');
    setStageFilter('');
    setPriorityFilter('');
    setPlatformFilter('');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        {/* 页面标题 */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">埋点工作台</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              统一管理多端埋点需求全生命周期，快速定位待办与状态流转
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 rounded-sm"
            onClick={() => setCreateOpen(true)}
            disabled={!canCreate}
            title={canCreate ? '新增埋点需求' : '未识别当前用户，无法新增需求'}
          >
            <Plus className="h-4 w-4" />
            新增需求
          </Button>
        </div>

        {/* 阶段统计卡片 */}
        <StageStats
          stats={stats}
          loading={statsLoading}
          error={statsError}
          activeStage={stageFilter}
          onRefresh={loadDashboard}
          onStageClick={handleStageClick}
        />

        {/* 我的待办 */}
        <MyTodos
          todos={todos}
          loading={todosLoading}
          error={todosError}
          onRefresh={loadDashboard}
          onItemClick={goToDetail}
        />

        {/* 需求列表 */}
        <RecordsTable
          records={records}
          loading={recordsLoading}
          error={recordsError}
          hasMore={hasMore}
          loadingMore={loadingMore}
          total={total}
          keyword={keyword}
          stage={stageFilter}
          priority={priorityFilter}
          platform={platformFilter}
          onSearch={setKeyword}
          onStageChange={setStageFilter}
          onPriorityChange={setPriorityFilter}
          onPlatformChange={setPlatformFilter}
          onReset={handleReset}
          onRetry={loadDashboard}
          onLoadMore={loadMoreRecords}
          onRowClick={goToDetail}
        />

        <NewTrackingRequestDialog
          open={createOpen}
          actorId={actor.id}
          actorLarkId={actor.larkId}
          actorName={actor.name}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      </div>
    </div>
  );
};

export default WorkbenchPage;

function normalizePlatformFilter(platformFilter: string): { source: TrackingSourceFilter; platform?: string } {
  if (platformFilter === 'App') return { source: 'app' };
  if (platformFilter === 'Web') return { source: 'web' };
  return {
    source: 'all',
    platform: platformFilter || undefined,
  };
}
