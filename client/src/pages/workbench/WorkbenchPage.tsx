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
} from '@shared/api.interface';

const WorkbenchPage = () => {
  const navigate = useNavigate();
  const userProfile = useCurrentUserProfile();
  const actor = getCurrentActor(userProfile);
  const [createOpen, setCreateOpen] = useState(false);
  const [canCreate, setCanCreate] = useState(true);

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

  // 加载阶段统计
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await trackingApi.getStageStats('all');
      setStats(res.items);
    } catch (err) {
      logger.error('加载阶段统计失败', err);
      setStatsError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // 加载我的待办
  const loadTodos = useCallback(async () => {
    setTodosLoading(true);
    setTodosError(null);
    try {
      const res = await trackingApi.getMyTodos(10, 'all');
      setTodos(res.items);
    } catch (err) {
      logger.error('加载我的待办失败', err);
      setTodosError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setTodosLoading(false);
    }
  }, []);

  // 加载需求列表
  const loadRecords = useCallback(
    async (isLoadMore = false) => {
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setRecordsLoading(true);
      }
      setRecordsError(null);
      try {
        const res = await trackingApi.getTrackingRecords({
          source: 'all',
          keyword: keyword || undefined,
          stage: stageFilter || undefined,
          priority: priorityFilter || undefined,
          platform: platformFilter || undefined,
          pageSize: 20,
          pageToken: isLoadMore ? pageToken : undefined,
        });
        if (isLoadMore) {
          setRecords((prev) => [...prev, ...res.items]);
        } else {
          setRecords(res.items);
        }
        setHasMore(res.hasMore);
        setPageToken(res.pageToken);
        setTotal(res.total);
      } catch (err) {
        logger.error('加载需求列表失败', err);
        setRecordsError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setRecordsLoading(false);
        setLoadingMore(false);
      }
    },
    [keyword, stageFilter, priorityFilter, platformFilter, pageToken],
  );

  // 初始加载
  useEffect(() => {
    loadStats();
    loadTodos();
  }, [loadStats, loadTodos]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await trackingApi.getPermissionConfig(actor.id);
        if (cancelled) return;
        setCanCreate(
          !res.initialized ||
            res.config.admins.includes(actor.id || '') ||
            res.config.dataScientists.includes(actor.id || ''),
        );
      } catch (err) {
        logger.warn('权限配置读取失败，保留新增入口', err);
        if (!cancelled) setCanCreate(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actor.id]);

  useEffect(() => {
    loadRecords(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, stageFilter, priorityFilter, platformFilter]);

  // 点击阶段卡片筛选
  const handleStageClick = (stage: string) => {
    setStageFilter(stageFilter === stage ? '' : stage);
  };

  // 跳转详情
  const goToDetail = (recordId: string) => {
    navigate(`/tracking/${recordId}`);
  };

  const handleCreate = async (data: CreateTrackingRecordRequest) => {
    const res = await trackingApi.createTrackingRecord(data);
    await Promise.all([loadStats(), loadTodos(), loadRecords(false)]);
    navigate(`/tracking/${res.recordId}?stage=params`);
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
            title={canCreate ? '新增埋点需求' : '只有管理员或 DS 可以新增需求'}
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
          onRefresh={loadStats}
          onStageClick={handleStageClick}
        />

        {/* 我的待办 */}
        <MyTodos
          todos={todos}
          loading={todosLoading}
          error={todosError}
          onRefresh={loadTodos}
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
          onRetry={() => loadRecords(false)}
          onLoadMore={() => loadRecords(true)}
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
