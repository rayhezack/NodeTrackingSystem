export const CONTEXT_MAX_FILES = 5;
export const CONTEXT_MAX_BYTES = 2 * 1024 * 1024;
export const CONTEXT_MAX_CHARS = 20_000;
export interface UploadDocument { id: string; name: string; size: number; content: string; truncated?: boolean; }
export function validateContextFile(file: { name: string; size: number }, existingNames: string[], count: number) {
  if (count >= CONTEXT_MAX_FILES) return `最多添加 ${CONTEXT_MAX_FILES} 个文件，请先移除不需要的文件`;
  if (!/\.(txt|md|markdown|json|csv)$/i.test(file.name)) return `${file.name} 格式不支持，请选择 txt、md、json 或 csv`;
  if (file.size > CONTEXT_MAX_BYTES) return `${file.name} 超过 2MB，请缩小后重试`;
  if (!file.size) return `${file.name} 是空文件`;
  if (existingNames.includes(file.name)) return `${file.name} 已添加，请先移除旧文件再替换`;
  return null;
}
