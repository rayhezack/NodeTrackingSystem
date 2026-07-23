import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '@lark-apaas/client-toolkit/logger';

import StageStats from './StageStats';
import MyTodos from './MyTodos';
import RecordsTable from './RecordsTable';

import * as trackingApi from '@client/src/api/tracking';
import type {
  StageStat,
  TodoItem,
  TrackingRecord,
} from '@shared/api.interface';

const WorkbenchPage = () => {
  const navigate = useNavigate();

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
      const res = await trackingApi.getStageStats();
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
      const res = await trackingApi.getMyTodos(10);
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
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-foreground">埋点工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理埋点需求全生命周期，快速定位待办与状态流转
          </p>
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
      </div>
    </div>
  );
};

export default WorkbenchPage;
