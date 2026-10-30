import { useEffect, useState, useRef } from 'react';
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
import type { TrackingAttachment, TrackingSource } from '@shared/api.interface';

interface UiImageFieldProps {
  value: TrackingAttachment[];
  source: TrackingSource;
  onChange?: (value: TrackingAttachment[]) => void;
  pageUrl?: string;
  onPageUrlChange?: (value: string) => void;
  pageUrlDisabled?: boolean;
  disabled?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  onUploadStateChange?: (uploading: boolean) => void;
}

export default function UiImageField({
  value,
  source,
  onChange,
  pageUrl = '',
  onPageUrlChange,
  pageUrlDisabled,
  disabled,
  placeholder,
  readOnly = false,
  onUploadStateChange,
}: UiImageFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<TrackingAttachment | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, { url: string; attempted: boolean }>>({});
  const [resolvingKeys, setResolvingKeys] = useState<Record<string, boolean>>({});
  const previewRetries = useRef(new Set<string>());
  const previewUrl = previewFile ? resolvedAttachmentUrl(previewFile, previewCache) : '';
  const previewName = previewFile ? attachmentName(previewFile, 0) : '';

  useEffect(() => {
    const unresolvedFiles = value
      .map((file) => ({ file, key: attachmentPreviewKey(file) }))
      .filter(({ file, key }) => {
        if (!key || (attachmentUrl(file) && !previewRetries.current.has(key))) return false;
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
    onUploadStateChange?.(true);
    try {
      const uploaded = await Promise.all(
        selectedFiles.map(async (file) => {
          const result = await uploadFile(file, source);
          return {
            bucket_id: result.bucketId,
            file_path: result.filePath,
            url: result.url,
            file_token: result.fileToken,
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
      onUploadStateChange?.(false);
    }
  };

  const removeAt = (index: number) => {
    onChange?.(value.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="rounded-md border border-input bg-card p-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            accept="image/*"
            multiple
            disabled={disabled || uploading}
            onChange={handleFileChange}
            className="h-8 max-w-xs rounded-md text-xs"
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

      <div className="mt-3 space-y-1.5">
        <div className="text-xs font-medium text-foreground">UI图对应网页链接</div>
        {readOnly ? (
          pageUrl ? (
            <a
              href={pageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
              title={pageUrl}
            >
              <span className="truncate">{pageUrl}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          ) : (
            <div className="text-xs text-muted-foreground">未填写</div>
          )
        ) : (
          <Input
            type="url"
            value={pageUrl}
            onChange={(event) => onPageUrlChange?.(event.target.value)}
            disabled={pageUrlDisabled ?? disabled}
            placeholder="粘贴当前 UI 图对应的网页链接（可选）"
            className="h-8 rounded-md text-sm"
          />
        )}
      </div>

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
                className="flex min-w-0 items-center gap-2 overflow-hidden rounded-md border border-border bg-muted/30 px-2 py-1.5"
              >
                {url ? (
                  <button
                    type="button"
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-background"
                    onClick={() => setPreviewFile(file)}
                    aria-label={`预览 ${fileName}`}
                  >
                    <img
                      src={url}
                      alt={fileName}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={() => retryPreview(file)}
                    />
                  </button>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background">
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
                  {!url && <span className="mt-0.5 block text-xs text-muted-foreground">
                    {isResolving ? '正在解析预览链接...' : '暂无可预览链接'}
                  </span>}
                </div>
                {url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="hidden h-6 rounded-full px-2 text-xs text-muted-foreground hover:text-primary sm:inline-flex"
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
                    className="h-6 w-6 rounded-full p-0 text-muted-foreground hover:text-destructive"
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
        <DialogContent className="max-w-5xl gap-0 overflow-hidden rounded-lg p-0">
          <DialogHeader className="border-b border-border px-4 py-3 pr-12">
            <DialogTitle className="truncate text-sm">{previewName || 'UI 图预览'}</DialogTitle>
            <DialogDescription className="sr-only">查看当前埋点事件关联的 UI 截图或原型图</DialogDescription>
          </DialogHeader>
          <div className="max-h-[72vh] overflow-auto bg-muted/30 p-4">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={previewName || 'UI 图预览'}
                className="mx-auto max-h-[68vh] max-w-full rounded-md border border-border bg-background object-contain"
                onError={() => previewFile && retryPreview(previewFile)}
              />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center rounded-md border border-dashed border-border bg-card text-xs text-muted-foreground">
                <ImageIcon className="mb-2 h-8 w-8" />
                该 UI 图暂无可预览链接
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border px-4 py-3">
            {previewUrl && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
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

  function retryPreview(file: TrackingAttachment) {
    const key = attachmentPreviewKey(file);
    if (!key) return;
    const attempted = previewRetries.current.has(key);
    previewRetries.current.add(key);
    setPreviewCache((current) => ({
      ...current,
      [key]: { url: '', attempted },
    }));
  }
}

function attachmentName(file: TrackingAttachment, index: number): string {
  return (
    textValue(file.name || file.fileName) ||
    textValue(file.file_path || file.filePath).split('/').pop() ||
    `UI图 ${index + 1}`
  );
}

function attachmentUrl(file: TrackingAttachment): string {
  // Feishu attachment URLs may be short-lived or require auth. Prefer resolving
  // by file_token so the server can obtain a fresh temporary download URL.
  if (textValue(file.file_token || file.fileToken || file.token).trim()) return '';
  const directUrl = textValue(
    file.url || file.download_url || file.downloadUrl || file.tmp_url || file.thumbnail_url || file.link,
  ).trim();
  if (directUrl) return directUrl;

  const filePath = textValue(file.file_path || file.filePath).trim();
  if (!filePath) return '';
  if (isPreviewableUrl(filePath)) return filePath;

  return '';
}

function resolvedAttachmentUrl(
  file: TrackingAttachment,
  previewCache: Record<string, { url: string; attempted: boolean }>,
): string {
  const cached = previewCache[attachmentPreviewKey(file)];
  if (cached) return cached.url;
  return attachmentUrl(file);
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
