import { useEffect, useState } from 'react';
import { getAppId } from '@lark-apaas/client-toolkit';
import { getDefaultBucketId } from '@lark-apaas/client-toolkit/tools/storage';
import { ExternalLink, Eye, Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { uploadFile } from '@client/src/components/business-ui/api/files/service';
import { resolveUiImagePreview } from '@client/src/api/tracking';
import type { TrackingAttachment } from '@shared/api.interface';

interface UiImageFieldProps {
  value: TrackingAttachment[];
  onChange?: (value: TrackingAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  readOnly?: boolean;
}

export default function UiImageField({
  value,
  onChange,
  disabled,
  placeholder,
  readOnly = false,
}: UiImageFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<TrackingAttachment | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, { url: string; attempted: boolean }>>({});
  const [resolvingKeys, setResolvingKeys] = useState<Record<string, boolean>>({});
  const previewUrl = previewFile ? resolvedAttachmentUrl(previewFile, previewCache) : '';
  const previewName = previewFile ? attachmentName(previewFile, 0) : '';

  useEffect(() => {
    const unresolvedFiles = value
      .map((file) => ({ file, key: attachmentPreviewKey(file) }))
      .filter(({ file, key }) => {
        if (!key || attachmentUrl(file)) return false;
        if (previewCache[key]?.attempted || resolvingKeys[key]) return false;
        return canResolveAttachmentPreview(file);
      })
      .slice(0, 6);

    if (!unresolvedFiles.length) return;

    setResolvingKeys((current) => ({
      ...current,
      ...Object.fromEntries(unresolvedFiles.map(({ key }) => [key, true])),
    }));

    Promise.all(
      unresolvedFiles.map(async ({ file, key }) => {
        const result = await resolveUiImagePreview({ attachment: file });
        return { key, url: result.url || '' };
      }),
    ).then((items) => {
      setPreviewCache((current) => ({
        ...current,
        ...Object.fromEntries(items.map((item) => [item.key, { url: item.url, attempted: true }])),
      }));
      setResolvingKeys((current) => {
        const next = { ...current };
        for (const item of items) delete next[item.key];
        return next;
      });
    });
  }, [value, previewCache, resolvingKeys]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selectedFiles.length || !onChange) return;
    const invalidFile = selectedFiles.find((file) => !file.type.startsWith('image/'));
    if (invalidFile) {
      toast.error('UI图仅支持图片文件');
      return;
    }

    setUploading(true);
    try {
      const uploaded = await Promise.all(
        selectedFiles.map(async (file) => {
          const result = await uploadFile(file);
          return {
            bucket_id: result.bucketId,
            file_path: result.filePath,
            url: result.url || buildStorageObjectUrl(result.filePath, result.bucketId),
            name: file.name,
          } satisfies TrackingAttachment;
        }),
      );
      onChange([...value, ...uploaded]);
      toast.success(`已上传 ${uploaded.length} 张 UI 图`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (index: number) => {
    onChange?.(value.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="rounded-sm border border-input bg-card p-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            accept="image/*"
            multiple
            disabled={disabled || uploading}
            onChange={handleFileChange}
            className="h-8 max-w-xs rounded-sm text-xs"
          />
          <span className="text-xs text-muted-foreground">
            {uploading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                上传中...
              </span>
            ) : (
              placeholder || '上传埋点事件对应的 UI 图'
            )}
          </span>
        </div>
      )}

      {value.length > 0 ? (
        <div className={`grid gap-2 sm:grid-cols-2 ${readOnly ? '' : 'mt-3'}`}>
          {value.map((file, index) => {
            const fileName = attachmentName(file, index);
            const key = attachmentPreviewKey(file);
            const url = resolvedAttachmentUrl(file, previewCache);
            const isResolving = Boolean(key && resolvingKeys[key]);
            return (
              <div
                key={`${key || file.file_path || file.url || fileName}-${index}`}
                className="flex min-w-0 items-center gap-2 overflow-hidden rounded-sm border border-border bg-muted/30 px-2 py-1.5"
              >
                {url ? (
                  <button
                    type="button"
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-sm border border-border bg-background"
                    onClick={() => setPreviewFile(file)}
                    aria-label={`预览 ${fileName}`}
                  >
                    <img src={url} alt={fileName} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-background">
                    {isResolving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}
                <div className="w-0 min-w-0 flex-1">
                  {url ? (
                    <button
                      type="button"
                      className="block max-w-full truncate text-left text-xs text-primary hover:underline"
                      onClick={() => setPreviewFile(file)}
                    >
                      {fileName}
                    </button>
                  ) : (
                    <span className="block truncate text-xs text-foreground">{fileName}</span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {url ? '点击预览 UI 图' : isResolving ? '正在解析预览链接...' : '暂无可预览链接'}
                  </span>
                </div>
                {url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="hidden h-6 rounded-sm px-2 text-xs text-muted-foreground hover:text-primary sm:inline-flex"
                    onClick={() => setPreviewFile(file)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    预览
                  </Button>
                )}
                {!readOnly && !disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 rounded-sm p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeAt(index)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`flex items-center gap-2 text-xs text-muted-foreground ${readOnly ? '' : 'mt-3'}`}>
          {readOnly ? <ImageIcon className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          暂无 UI 图
        </div>
      )}

      <Dialog open={Boolean(previewFile)} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-5xl gap-0 overflow-hidden rounded-sm p-0">
          <DialogHeader className="border-b border-border px-4 py-3 pr-12">
            <DialogTitle className="truncate text-sm">{previewName || 'UI 图预览'}</DialogTitle>
            <DialogDescription className="text-xs">查看当前埋点事件关联的 UI 截图或原型图</DialogDescription>
          </DialogHeader>
          <div className="max-h-[72vh] overflow-auto bg-muted/30 p-4">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={previewName || 'UI 图预览'}
                className="mx-auto max-h-[68vh] max-w-full rounded-sm border border-border bg-background object-contain"
              />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center rounded-sm border border-dashed border-border bg-card text-xs text-muted-foreground">
                <ImageIcon className="mb-2 h-8 w-8" />
                该 UI 图暂无可预览链接
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border px-4 py-3">
            {previewUrl && (
              <Button asChild variant="outline" size="sm" className="rounded-sm">
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  新窗口打开
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function attachmentName(file: TrackingAttachment, index: number): string {
  return (
    textValue(file.name || file.fileName) ||
    textValue(file.file_path || file.filePath).split('/').pop() ||
    `UI图 ${index + 1}`
  );
}

function attachmentUrl(file: TrackingAttachment): string {
  const directUrl = textValue(
    file.url || file.download_url || file.downloadUrl || file.tmp_url || file.thumbnail_url || file.link,
  ).trim();
  if (directUrl) return directUrl;

  const filePath = textValue(file.file_path || file.filePath).trim();
  if (!filePath) return '';
  if (isPreviewableUrl(filePath)) return filePath;

  const bucketId = textValue(file.bucket_id || file.bucketId).trim() || getDefaultBucketId();
  return buildStorageObjectUrl(filePath, bucketId);
}

function resolvedAttachmentUrl(
  file: TrackingAttachment,
  previewCache: Record<string, { url: string; attempted: boolean }>,
): string {
  const directUrl = attachmentUrl(file);
  if (directUrl) return directUrl;
  const key = attachmentPreviewKey(file);
  return key ? previewCache[key]?.url || '' : '';
}

function canResolveAttachmentPreview(file: TrackingAttachment): boolean {
  return Boolean(
    textValue(file.file_path || file.filePath).trim() ||
    textValue(file.name || file.fileName).trim() ||
    textValue(file.file_token || file.fileToken || file.token).trim(),
  );
}

function attachmentPreviewKey(file: TrackingAttachment): string {
  return [
    file.file_token,
    file.fileToken,
    file.token,
    file.url,
    file.download_url,
    file.downloadUrl,
    file.file_path,
    file.filePath,
    file.name,
    file.fileName,
  ]
    .map((value) => textValue(value).trim())
    .filter(Boolean)
    .join('|');
}

function buildStorageObjectUrl(filePath: string, bucketId?: string): string {
  const normalizedPath = filePath.trim().replace(/^\/+/, '');
  const normalizedBucketId = (bucketId || '').trim();
  const appId = getAppId();
  if (!appId || !normalizedBucketId || !normalizedPath) return '';
  return `/app/${appId}/runtime/api/v1/storage/object/${normalizedBucketId}/${encodeURIComponent(normalizedPath)}`;
}

function isPreviewableUrl(value: string): boolean {
  const text = value.trim();
  return (
    isHttpUrl(text) ||
    text.startsWith('/app/') ||
    text.startsWith('/spark/app/') ||
    text.startsWith('/runtime/api/v1/storage/object/') ||
    text.startsWith('/aily/api/v1/files/static/')
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
