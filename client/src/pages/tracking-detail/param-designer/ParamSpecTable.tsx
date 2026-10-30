import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Edit, Loader2, Trash2, Undo2 } from 'lucide-react';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { ChecklistCheckbox } from '@client/src/components/bencho/Checklist';
import type { ParamDetail, TrackingSource } from '@shared/api.interface';
import { normalizePlatformDisplay } from './param-display.utils';

interface ParamSpecTableProps {
  items: ParamDetail[];
  source: TrackingSource;
  canEdit?: boolean;
  selectedIds?: string[];
  removingIds?: string[];
  pendingDeleteIds?: string[];
  onUndoDelete?: () => void;
  onSelectionChange?: (ids: string[]) => void;
  onEdit?: (item: ParamDetail) => void;
  onDelete?: (item: ParamDetail) => void;
}

const ParamSpecTable = ({ items, source, canEdit = false, selectedIds = [], removingIds = [], pendingDeleteIds = [], onUndoDelete, onSelectionChange, onEdit, onDelete }: ParamSpecTableProps) => {
  const selectable = canEdit && Boolean(onSelectionChange);
  const still = Boolean(useReducedMotion());
  const selected = new Set(selectedIds), removing = new Set(removingIds), pending = new Set(pendingDeleteIds);
  const all = items.length > 0 && items.every(item => selected.has(item.recordId));
  const busy = pendingDeleteIds.length > 0 || removingIds.length > 0;
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    onSelectionChange?.([...next]);
  };
  return <div className="param-spec-list" aria-label="参数设计列表">
    {selectable && <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <ChecklistCheckbox checked={all} mixed={!all && selectedIds.length > 0} disabled={busy} label="选择全部参数"
        onChange={checked => onSelectionChange?.(checked ? items.map(item => item.recordId) : [])} />
      <span>选择参数{selectedIds.length ? ` · 已选 ${selectedIds.length} 个` : ''}</span>
    </div>}
    <AnimatePresence initial={false}>
      {items.map(item => <motion.section key={item.recordId} className="param-spec-row"
        aria-label={item.paramKey} aria-busy={removing.has(item.recordId)} data-selected={selected.has(item.recordId) || undefined} data-pending-delete={pending.has(item.recordId) || undefined}
        layout={!still} initial={false}
        /* Removal is driven by the API result, never by a demo reset.
           The departing row folds away; the remaining rows spring into place. */
        exit={still ? { opacity: 0 } : { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, x: 24 }}
        transition={still ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 }}>
        {pending.has(item.recordId) ? <div className="flex min-w-0 items-center gap-3" role="status">
          <div className="min-w-0 flex-1">
            <code className="break-all text-xs font-medium">{item.paramKey}</code>
            <p className="mt-1 text-xs text-muted-foreground">{removing.has(item.recordId) ? '正在删除…' : pendingDeleteIds.length > 1 ? `将删除 ${pendingDeleteIds.length} 个设计参数，5 秒内可撤销` : '将删除此设计参数，5 秒内可撤销'}</p>
          </div>
          {removing.has(item.recordId) ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" /> : <Button autoFocus={pendingDeleteIds[0] === item.recordId} variant="outline" size="sm" className="h-8 shrink-0 border-primary/20 bg-card px-3 text-primary hover:bg-primary/10 hover:text-primary" aria-label={`撤销删除参数 ${item.paramKey}`} onClick={onUndoDelete}><Undo2 className="h-3.5 w-3.5" />{pendingDeleteIds.length > 1 ? '全部撤销' : '撤销'}</Button>}
        </div> : <>
        <div className="param-spec-top">
          {selectable && <ChecklistCheckbox checked={selected.has(item.recordId)} disabled={busy} label={`选择参数 ${item.paramKey}`} onChange={checked => toggle(item.recordId, checked)} />}
          <div className="param-spec-title">
            <span className="chk-say"><code>{item.paramKey}</code>
              <motion.span className="chk-rule" aria-hidden="true" initial={false}
                animate={{ scaleX: removing.has(item.recordId) ? 1 : 0 }} transition={{ duration: still ? 0 : 0.18 }} />
            </span>
            <small>{item.paramName || '-'} · {normalizePlatformDisplay(item.platform, source)}</small>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="border-0 bg-card text-xs font-normal">{item.paramType || 'STRING'}</Badge>
              <Badge variant="outline" className="border-0 bg-card text-xs font-normal">{item.requiredRule || (item.required ? '必传' : '非必传')}</Badge>
            </div>
          </div>
          {canEdit && <div className="param-spec-actions">
            <Button variant="ghost" size="icon" aria-label={`编辑参数 ${item.paramKey}`} title="编辑参数" disabled={busy} onClick={() => onEdit?.(item)}><Edit /></Button>
            <Button variant="ghost" size="icon" aria-label={`删除参数 ${item.paramKey}`} title="删除参数" disabled={busy} onClick={() => onDelete?.(item)}>{removing.has(item.recordId) ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button>
          </div>}
        </div>
        <dl className="param-spec-fields">
          <div><dt>参数定义</dt><dd>{item.definition || '未填写参数定义'}</dd>{item.requestNotes && <><dt className="mt-3">本次需求说明</dt><dd>{item.requestNotes}</dd></>}</div>
          <div><dt>枚举 / 示例</dt><dd className="param-enum">{item.enumRange || '-'}{(item.example || item.defaultValue) && <><br /><span className="text-muted-foreground">示例：</span>{item.example || item.defaultValue}</>}</dd></div>
          <div><dt>条件说明</dt><dd>{item.triggerCondition || '-'}</dd></div>
        </dl>
        </>}
      </motion.section>)}
    </AnimatePresence>
  </div>;
};
export default ParamSpecTable;
