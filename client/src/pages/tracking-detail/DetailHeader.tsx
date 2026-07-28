import { Badge } from '@client/src/components/ui/badge';
import { UserDisplay } from '@client/src/components/business-ui/user-display';
import type { TrackingDetail } from '@shared/api.interface';
import { getCurrentUiNode } from './stage-config';

interface DetailHeaderProps {
  detail: TrackingDetail;
}

// 阶段语义色映射
function getStageBadgeVariant(stage: string): { variant: 'default' | 'secondary' | 'outline' | 'destructive'; style?: React.CSSProperties } {
  if (stage === '稳定归档' || stage === '上线监控') {
    return { variant: 'outline', style: { backgroundColor: 'hsl(160, 84%, 96%)', color: 'hsl(160, 84%, 39%)', borderColor: 'hsl(160, 84%, 85%)' } };
  }
  if (stage === '已废弃') {
    return { variant: 'outline', style: { backgroundColor: 'hsl(0, 84%, 96%)', color: 'hsl(0, 84%, 60%)', borderColor: 'hsl(0, 84%, 85%)' } };
  }
  if (['埋点设计', '埋点评审', '评审通过'].includes(stage)) {
    return { variant: 'outline', style: { backgroundColor: 'hsl(38, 92%, 96%)', color: 'hsl(38, 92%, 50%)', borderColor: 'hsl(38, 92%, 85%)' } };
  }
  return { variant: 'default' };
}

// 状态 badge 样式
function getStatusStyle(status: string): React.CSSProperties {
  const s = status || '';
  if (s.includes('通过') || s.includes('完成') || s.includes('上线') || s.includes('正常')) {
    return { backgroundColor: 'hsl(160, 84%, 96%)', color: 'hsl(160, 84%, 39%)', borderColor: 'hsl(160, 84%, 85%)' };
  }
  if (s.includes('驳回') || s.includes('失败') || s.includes('废弃') || s.includes('异常')) {
    return { backgroundColor: 'hsl(0, 84%, 96%)', color: 'hsl(0, 84%, 60%)', borderColor: 'hsl(0, 84%, 85%)' };
  }
  if (s.includes('中') || s.includes('待')) {
    return { backgroundColor: 'hsl(38, 92%, 96%)', color: 'hsl(38, 92%, 50%)', borderColor: 'hsl(38, 92%, 85%)' };
  }
  return { backgroundColor: 'hsl(220, 14%, 92%)', color: 'hsl(222, 47%, 11%)', borderColor: 'hsl(220, 13%, 91%)' };
}

const DetailHeader = ({ detail }: DetailHeaderProps) => {
  const displayStage = getCurrentUiNode(
    detail.stage,
    detail.reviewStatus,
    fieldText(detail.archiveFields['正式状态']),
  );
  const stageBadge = getStageBadgeVariant(displayStage);

  return (
    <div className="border-b border-border bg-card px-6 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        {/* 左侧：evt_id + 事件名 */}
        <div className="flex flex-col gap-1">
          <div className="font-mono text-lg font-semibold text-foreground tracking-tight">
            {detail.evtId || '待填写 evt_id'}
          </div>
          <div className="text-sm text-muted-foreground">
            {detail.requestName || detail.eventName || '未命名需求'}
          </div>
          {detail.requestName && detail.eventName && detail.requestName !== detail.eventName && (
            <div className="text-xs text-muted-foreground">
              事件：{detail.eventName}
            </div>
          )}
        </div>

        {/* 右侧：状态 + 负责人 */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">库</span>
            <Badge variant="outline" className="rounded-sm">
              {detail.source === 'web' ? 'Web' : 'App'}
            </Badge>
          </div>

          {/* 阶段 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">阶段</span>
            <Badge variant={stageBadge.variant} style={stageBadge.style} className="rounded-sm">
              {displayStage || '-'}
            </Badge>
          </div>

          {/* 评审状态 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">评审</span>
            <Badge variant="outline" style={getStatusStyle(detail.reviewStatus)} className="rounded-sm">
              {detail.reviewStatus || '-'}
            </Badge>
          </div>

          {/* 开发状态 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">开发</span>
            <Badge variant="outline" style={getStatusStyle(detail.devStatus)} className="rounded-sm">
              {detail.devStatus || '-'}
            </Badge>
          </div>

          {/* 验收状态 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">验收</span>
            <Badge variant="outline" style={getStatusStyle(detail.acceptanceStatus)} className="rounded-sm">
              {detail.acceptanceStatus || '-'}
            </Badge>
          </div>

          {/* 数据负责人 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground shrink-0">提需人</span>
            <div className="min-w-0">
              <UserDisplay value={detail.requester} size="small" accountType="apaas" />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground shrink-0">录入人</span>
            <div className="min-w-0">
              <UserDisplay value={detail.recorder} size="small" accountType="apaas" />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground shrink-0">数据负责人</span>
            <div className="min-w-0">
              <UserDisplay value={detail.dataOwner} size="small" accountType="apaas" />
            </div>
          </div>

          {/* 研发负责人 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground shrink-0">研发负责人</span>
            <div className="min-w-0">
              <UserDisplay value={detail.devOwner} size="small" accountType="apaas" />
            </div>
          </div>

          {/* DS 验收人 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground shrink-0">DS验收人</span>
            <div className="min-w-0">
              <UserDisplay value={detail.dsAcceptor} size="small" accountType="apaas" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailHeader;

function fieldText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
