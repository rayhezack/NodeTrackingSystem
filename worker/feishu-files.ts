import { BITABLE_INSTANCES } from './feishu-bitable';
import { getFeishuTenantToken, type FeishuCredentials } from './feishu-token';

type FetchLike = typeof fetch;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function uploadBitableImage(
  credentials: FeishuCredentials,
  file: File,
  source: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ id: string; filePath: string; bucketId: string; url: string; fileToken: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Only image uploads are supported');
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new Error('Image size must be between 1 byte and 20 MiB');
  const instance = source === 'web' ? BITABLE_INSTANCES.webWorkbench : BITABLE_INSTANCES.workbench;
  const token = await getFeishuTenantToken(credentials, fetchImpl);
  const body = new FormData();
  body.append('file_name', file.name);
  body.append('parent_type', 'bitable_image');
  body.append('parent_node', instance.appToken);
  body.append('size', String(file.size));
  body.append('file', file, file.name);
  const response = await fetchImpl('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const payload = await response.json() as { code?: number; msg?: string; data?: { file_token?: string } };
  const fileToken = payload.data?.file_token || '';
  if (!response.ok || payload.code !== 0 || !fileToken) {
    throw new Error(`Feishu media upload failed: ${response.status} ${payload.msg || 'unknown error'}`);
  }
  return { id: fileToken, filePath: fileToken, bucketId: instance.appToken, url: '', fileToken };
}

export async function getBitableMediaPreviewUrl(
  credentials: FeishuCredentials,
  fileToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  if (!fileToken.trim()) return '';
  const token = await getFeishuTenantToken(credentials, fetchImpl);
  const response = await fetchImpl(
    `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${encodeURIComponent(fileToken)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const payload = await response.json() as {
    code?: number;
    msg?: string;
    data?: { tmp_download_urls?: Array<{ file_token?: string; tmp_download_url?: string }> };
  };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu media preview failed: ${response.status} ${payload.msg || 'unknown error'}`);
  }
  return payload.data?.tmp_download_urls?.find((item) => item.file_token === fileToken)?.tmp_download_url || '';
}
