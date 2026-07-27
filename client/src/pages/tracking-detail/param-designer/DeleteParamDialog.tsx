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
  paramKey: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const DeleteParamDialog = ({
  open,
  paramKey,
  onClose,
  onConfirm,
}: DeleteParamDialogProps) => {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      toast.success('参数已删除');
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
            确认删除参数
          </DialogTitle>
          <DialogDescription className="text-xs">
            确定要删除参数 <span className="font-medium text-foreground">{paramKey}</span> 吗？
            <br />
            该操作会从当前埋点设计中移除该参数；埋点整体上线后，仅保留仍存在的参数进入正式查询库。
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
