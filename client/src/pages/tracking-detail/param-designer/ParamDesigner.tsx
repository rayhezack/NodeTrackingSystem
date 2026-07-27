import { useState, useEffect, useCallback } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Plus, AlertCircle, Wrench, Loader2, Copy } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { toast } from 'sonner';
import {
  getParams,
  createParam,
  updateParam,
  deleteParam,
} from '@client/src/api/tracking';
import type {
  ParamDetail,
  CreateParamRequest,
  TrackingSource,
} from '@shared/api.interface';
import ParamFormDialog from './ParamFormDialog';
import DeleteParamDialog from './DeleteParamDialog';
import ParamSpecTable from './ParamSpecTable';
import { buildParamClipboardText } from './param-display.utils';

interface ParamDesignerProps {
  recordId: string;
  source: TrackingSource;
  evtId: string;
  canEdit: boolean;
  actorId?: string;
  actorLarkId?: string;
}

const ParamDesigner = ({
  recordId,
  source,
  evtId,
  canEdit,
  actorId,
  actorLarkId,
}: ParamDesignerProps) => {
  const [items, setItems] = useState<ParamDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingParam, setEditingParam] = useState<ParamDetail | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingParam, setDeletingParam] = useState<ParamDetail | null>(null);

  const loadParams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getParams(recordId);
      setItems(res.items || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      setError(msg);
      logger.error('加载参数列表失败', err);
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    if (recordId) {
      loadParams();
    }
  }, [recordId, loadParams]);

  const handleCreate = () => {
    setFormMode('create');
    setEditingParam(null);
    setFormOpen(true);
  };

  const handleEdit = (param: ParamDetail) => {
    setFormMode('edit');
    setEditingParam(param);
    setFormOpen(true);
  };

  const handleDelete = (param: ParamDetail) => {
    setDeletingParam(param);
    setDeleteOpen(true);
  };

  const handleFormSubmit = async (data: CreateParamRequest) => {
    if (formMode === 'create') {
      const res = await createParam(recordId, {
        ...data,
        actorId,
        actorLarkId,
      });
      setItems((prev) => upsertParam(prev, res.item));
    } else if (editingParam) {
      const res = await updateParam(editingParam.recordId, {
        fields: data as unknown as Record<string, unknown>,
        actorId,
        actorLarkId,
      });
      setItems((prev) => upsertParam(prev, res.item));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingParam) return;
    await deleteParam(deletingParam.recordId, actorId, actorLarkId);
    setItems((prev) => prev.filter((item) => item.recordId !== deletingParam.recordId));
    setDeletingParam(null);
  };

  const handleCopyParams = async () => {
    try {
      await copyText(buildParamClipboardText(items, source, `${evtId || '当前事件'} 参数说明`));
      toast.success('参数说明已复制');
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-foreground">参数设计</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              配置该事件的参数明细；参数 key 将按 evt_id.参数名 自动生成
            </p>
          </div>
          {canEdit && (
            <Button size="sm" className="rounded-sm h-8" disabled>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              新增参数
            </Button>
          )}
        </div>
        <div className="rounded-sm border border-border bg-card">
          <div className="h-9 border-b border-border bg-muted/30 animate-pulse" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 border-b border-border animate-pulse bg-muted/10" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-medium text-foreground">参数设计</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            配置该事件的参数明细；参数 key 将按 evt_id.参数名 自动生成
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-sm border border-border bg-card py-16">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <p className="text-sm font-medium text-foreground">加载失败</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 rounded-sm h-8"
            onClick={loadParams}
          >
            重试
          </Button>
        </div>
      </div>
    );
  }

  const isEmpty = items.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-foreground">
            参数设计
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              共 {items.length} 个参数
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            配置该事件的参数明细；研发可直接查看参数含义、枚举值和示例
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={handleCopyParams}
            >
              <Copy className="h-3.5 w-3.5" />
              复制参数说明
            </Button>
          )}
          {canEdit && (
            <Button size="sm" className="h-8 rounded-sm" onClick={handleCreate}>
              <Plus className="h-3.5 w-3.5" />
              新增参数
            </Button>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border bg-muted/30 py-16">
          <Wrench className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground font-medium">暂无参数</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {canEdit ? '点击右上角「新增参数」开始配置' : '请联系数据负责人配置参数'}
          </p>
        </div>
      ) : (
        <ParamSpecTable
          items={items}
          source={source}
          canEdit={canEdit}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      <ParamFormDialog
        open={formOpen}
        mode={formMode}
        source={source}
        defaultEvtId={evtId}
        initialData={editingParam}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <DeleteParamDialog
        open={deleteOpen}
        paramKey={deletingParam?.paramKey || ''}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};

export default ParamDesigner;

function upsertParam(items: ParamDetail[], next: ParamDetail): ParamDetail[] {
  const existed = items.some((item) => item.recordId === next.recordId);
  const merged = existed
    ? items.map((item) => (item.recordId === next.recordId ? next : item))
    : [...items, next];
  return [...merged].sort((a, b) => a.paramKey.localeCompare(b.paramKey));
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
