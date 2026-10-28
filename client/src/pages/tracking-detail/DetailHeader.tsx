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
    return { variant: 'outline', style: { backgroundColor: 'var(--status-success-bg)', color: 'var(--success)', borderColor: 'var(--border)' } };
  }
  if (stage === '已废弃') {
    return { variant: 'outline', style: { backgroundColor: '#fff0f0', color: '#c62828', borderColor: '#f3c5c5' } };
  }
  if (['埋点设计', '埋点评审', '评审通过'].includes(stage)) {
    return { variant: 'outline', style: { backgroundColor: '#f4f6f8', color: '#4b5157', borderColor: '#e4e7eb' } };
  }
  return { variant: 'default' };
}

// 状态 badge 样式
function getStatusStyle(status: string): React.CSSProperties {
  const s = status || '';
  if (s.includes('通过') || s.includes('完成') || s.includes('上线') || s.includes('正常')) {
    return { backgroundColor: 'var(--status-success-bg)', color: 'var(--success)', borderColor: 'var(--border)' };
  }
  if (s.includes('驳回') || s.includes('失败') || s.includes('废弃') || s.includes('异常')) {
    return { backgroundColor: '#fff0f0', color: '#c62828', borderColor: '#f3c5c5' };
  }
  if (s.includes('中') || s.includes('待')) {
    return { backgroundColor: '#fff4d6', color: '#8a5a13', borderColor: '#e8c97d' };
  }
  return { backgroundColor: '#f4f6f8', color: '#4b5157', borderColor: '#e4e7eb' };
}

const DetailHeader = ({ detail }: DetailHeaderProps) => {
  const displayStage = getCurrentUiNode(
    detail.stage,
    detail.reviewStatus,
    fieldText(detail.archiveFields['正式状态']),
  );
  const stageBadge = getStageBadgeVariant(displayStage);

  return (
    <div className="border-b border-border bg-card px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="break-all font-mono text-lg font-semibold tracking-tight text-foreground">
            {detail.evtId || '待填写 evt_id'}
          </h1>
          <p className="mt-1 break-words text-sm text-muted-foreground">{detail.requestName || detail.eventName || '未命名需求'}</p>
          {detail.requestName && detail.eventName && detail.requestName !== detail.eventName && (
            <p className="mt-1 text-xs text-muted-foreground">事件：{detail.eventName}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <Badge variant="outline">{detail.source === 'web' ? 'Web' : 'App'}</Badge>
          <Badge variant={stageBadge.variant} style={stageBadge.style}>{displayStage || '-'}</Badge>
          {[
            ['评审', detail.reviewStatus],
            ['开发', detail.devStatus],
            ['验收', detail.acceptanceStatus],
          ].map(([label, status]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{label}</span>
              <Badge variant="outline" style={getStatusStyle(status)}>{status || '-'}</Badge>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
        {[
          { label: '提需人', value: detail.requester },
          { label: '数据负责人', value: detail.dataOwner },
          { label: '研发负责人', value: detail.devOwner },
          { label: '埋点校验人', value: detail.dsAcceptor },
        ].map(({ label, value }) => (
          <div key={label} className="min-w-0 space-y-1.5 text-xs">
            <div className="text-muted-foreground">{label}</div>
            <UserDisplay value={value} size="small" accountType="apaas" />
          </div>
        ))}
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
