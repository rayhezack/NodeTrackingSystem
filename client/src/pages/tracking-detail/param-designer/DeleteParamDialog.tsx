import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';

interface DeleteParamDialogProps {
  open: boolean;
  paramKey?: string;
  paramKeys?: string[];
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const DeleteParamDialog = ({
  open,
  paramKey,
  paramKeys = [],
  onClose,
  onConfirm,
}: DeleteParamDialogProps) => {
  const [deleting, setDeleting] = useState(false);
  const keys = paramKeys.length ? paramKeys : paramKey ? [paramKey] : [];
  const isBatch = keys.length > 1;

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      toast.success(isBatch ? `已删除 ${keys.length} 个参数` : '参数已删除');
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !deleting && onClose()}>
      <DialogContent className="max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {isBatch ? '确认批量删除参数' : '确认删除参数'}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-xs text-muted-foreground">
              {isBatch ? (
                <>
                  确定要删除已选择的 <span className="font-medium text-foreground">{keys.length}</span> 个参数吗？
                  <div className="mt-2 max-h-28 overflow-y-auto rounded-sm bg-muted/50 p-2 font-mono text-[11px] text-foreground">
                    {keys.slice(0, 8).map((key) => (
                      <div key={key} className="truncate">{key}</div>
                    ))}
                    {keys.length > 8 && (
                      <div className="text-muted-foreground">还有 {keys.length - 8} 个参数...</div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  确定要删除参数 <span className="font-medium text-foreground">{keys[0]}</span> 吗？
                </>
              )}
              <div className="mt-2">
                该操作会从当前埋点设计中移除{isBatch ? '所选参数' : '该参数'}；埋点整体上线后，仅保留仍存在的参数进入正式查询库。
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="rounded-sm h-8"
            onClick={onClose}
            disabled={deleting}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="rounded-sm h-8"
            onClick={handleConfirm}
            disabled={deleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? '处理中...' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteParamDialog;
