import { useState, useEffect, useCallback } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Plus, Edit, Trash2, AlertCircle, Wrench, Loader2 } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@client/src/components/ui/table';
import {
  getParams,
  createParam,
  updateParam,
  deleteParam,
} from '@client/src/api/tracking';
import type { ParamDetail, CreateParamRequest, TrackingSource } from '@shared/api.interface';
import ParamFormDialog from './ParamFormDialog';
import DeleteParamDialog from './DeleteParamDialog';

interface ParamDesignerProps {
  recordId: string;
  source: TrackingSource;
  evtId: string;
  canEdit: boolean;
}

const ParamDesigner = ({ recordId, source, evtId, canEdit }: ParamDesignerProps) => {
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
      await createParam(recordId, data);
    } else if (editingParam) {
      await updateParam(editingParam.recordId, {
        fields: data as unknown as Record<string, unknown>,
      });
    }
    await loadParams();
  };

  const handleDeleteConfirm = async () => {
    if (!deletingParam) return;
    await deleteParam(deletingParam.recordId);
    await loadParams();
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-foreground">参数设计</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              配置该事件的参数明细，包括参数 key、参数名、类型、必传规则、枚举范围和定义说明
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
            配置该事件的参数明细，包括参数 key、参数名、类型、必传规则、枚举范围和定义说明
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
            配置该事件的参数明细，包括参数 key、参数名、类型、必传规则、枚举范围和定义说明
          </p>
        </div>
        {canEdit && (
          <Button size="sm" className="rounded-sm h-8" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
            新增参数
          </Button>
        )}
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
        <div className="rounded-sm border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="h-9 bg-muted/30 hover:bg-muted/30">
                <TableHead className="h-9 text-xs font-medium py-0">参数 key</TableHead>
                <TableHead className="h-9 text-xs font-medium py-0">参数名</TableHead>
                <TableHead className="h-9 text-xs font-medium py-0">参数类型</TableHead>
                <TableHead className="h-9 text-xs font-medium py-0">是否必传</TableHead>
                <TableHead className="h-9 text-xs font-medium py-0">枚举范围</TableHead>
                <TableHead className="h-9 text-xs font-medium py-0">适用端</TableHead>
                <TableHead className="h-9 text-xs font-medium py-0">状态</TableHead>
                {canEdit && (
                  <TableHead className="h-9 text-xs font-medium py-0 w-[100px]">操作</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isDeprecated = item.status === '废弃';
                return (
                  <TableRow
                    key={item.recordId}
                    className={`h-9 transition-colors ${
                      isDeprecated
                        ? 'text-muted-foreground/60 line-through decoration-muted-foreground/40'
                        : ''
                    }`}
                  >
                    <TableCell className="h-9 py-0 text-xs font-mono">{item.paramKey}</TableCell>
                    <TableCell className="h-9 py-0 text-xs">{item.paramName}</TableCell>
                    <TableCell className="h-9 py-0 text-xs">{item.paramType}</TableCell>
                    <TableCell className="h-9 py-0 text-xs">
                      {item.required ? (
                        <Badge variant="default" className="h-5 rounded-sm text-[10px] px-1.5 font-normal">必传</Badge>
                      ) : (
                        <Badge variant="outline" className="h-5 rounded-sm text-[10px] px-1.5 font-normal">可选</Badge>
                      )}
                    </TableCell>
                    <TableCell className="h-9 py-0 text-xs max-w-[160px] truncate">
                      {item.enumRange || '-'}
                    </TableCell>
                    <TableCell className="h-9 py-0 text-xs">{item.platform || '-'}</TableCell>
                    <TableCell className="h-9 py-0 text-xs">
                      {isDeprecated ? (
                        <Badge variant="destructive" className="h-5 rounded-sm text-[10px] px-1.5 font-normal">废弃</Badge>
                      ) : (
                        <Badge variant="default" className="h-5 rounded-sm text-[10px] px-1.5 font-normal bg-[hsl(160_84%_39%)] hover:bg-[hsl(160_84%_39%)]">正常</Badge>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="h-9 py-0 text-xs w-[100px]">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 rounded-sm text-xs text-muted-foreground hover:text-foreground" onClick={() => handleEdit(item)}>
                            <Edit className="h-3.5 w-3.5" />
                            编辑
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 rounded-sm text-xs text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item)} disabled={isDeprecated}>
                            <Trash2 className="h-3.5 w-3.5" />
                            废弃
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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
