import { TrackingWriteError } from './tracking-write';

export interface DraftBlobStorage {
  put(key: string, value: string, options: { contentType: string }): Promise<unknown>;
  getText(key: string): Promise<string | null>;
}

// PolloCloud limits each database field to 64 KB, measured in bytes.
const INLINE_LIMIT = 60_000;
type Cipher = (value: string) => Promise<string>;

export async function encodeDraftPayload(
  serialized: string, draftId: string, storage: DraftBlobStorage | undefined, encrypt: Cipher,
): Promise<string> {
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes <= INLINE_LIMIT) return serialized;
  if (!storage) throw new TrackingWriteError('AI 草稿较大，需要文件存储保存；请重新发布以启用存储', 503);
  const key = `ai-draft-payloads/${draftId}/${crypto.randomUUID()}.enc`;
  try {
    // App storage is readable by app members. Store ciphertext, never the PRD/design plaintext.
    await storage.put(key, await encrypt(serialized), { contentType: 'application/octet-stream' });
  } catch {
    throw new TrackingWriteError('AI 草稿文件保存失败，请检查应用存储配额后重试', 503);
  }
  return JSON.stringify({ kind: 'encrypted-ai-draft-v1', key, bytes });
}

export async function decodeDraftPayload(
  payload: string, storage: DraftBlobStorage | undefined, decrypt: Cipher,
): Promise<unknown> {
  const value = JSON.parse(payload);
  if (value?.kind !== 'encrypted-ai-draft-v1') return value;
  if (!storage || typeof value.key !== 'string' || !/^ai-draft-payloads\/[^/]+\/[^/]+\.enc$/.test(value.key)) {
    throw new TrackingWriteError('AI 草稿文件存储不可用，请联系管理员', 503);
  }
  try {
    const encrypted = await storage.getText(value.key);
    if (!encrypted) throw new Error('missing draft blob');
    return JSON.parse(await decrypt(encrypted));
  } catch {
    throw new TrackingWriteError('AI 草稿文件读取失败，请重新生成', 503);
  }
}
