import { decodeDraftPayload, encodeDraftPayload } from '../../worker/ai-draft-payload';

describe('PolloCloud AI draft payload persistence', () => {
  const encrypt = jest.fn(async (value: string) => `encrypted:${Buffer.from(value).toString('base64')}`);
  const decrypt = async (value: string) => Buffer.from(value.slice('encrypted:'.length), 'base64').toString();
  const setup = () => {
    const blobs = new Map<string, string>();
    return {
      blobs,
      put: jest.fn(async (key: string, value: string) => { blobs.set(key, value); }),
      getText: jest.fn(async (key: string) => blobs.get(key) || null),
    };
  };

  it('reads existing inline drafts without storage or decryption', async () => {
    const serialized = JSON.stringify({ id: 'existing', events: [] });
    expect(await encodeDraftPayload(serialized, 'existing', undefined, encrypt)).toBe(serialized);
    expect(await decodeDraftPayload(serialized, undefined, decrypt)).toEqual(JSON.parse(serialized));
  });

  it('uses byte length for Chinese drafts, encrypts the blob and round-trips every field', async () => {
    const draft = { id: 'large', evidence: '正式参数定义'.repeat(5_000), governance: { workflowVersion: 'official-first-v2' } };
    const serialized = JSON.stringify(draft);
    expect(serialized.length).toBeLessThan(60_000);
    expect(Buffer.byteLength(serialized)).toBeGreaterThan(65_536);
    const storage = setup();
    const pointer = await encodeDraftPayload(serialized, draft.id, storage, encrypt);
    expect(Buffer.byteLength(pointer)).toBeLessThan(1_000);
    expect(JSON.parse(pointer)).toEqual(expect.objectContaining({ kind: 'encrypted-ai-draft-v1', bytes: Buffer.byteLength(serialized) }));
    const stored = [...storage.blobs.values()][0];
    expect(stored).not.toContain('正式参数定义');
    expect(await decodeDraftPayload(pointer, storage, decrypt)).toEqual(draft);
    const secondPointer = await encodeDraftPayload(serialized, draft.id, storage, encrypt);
    expect(JSON.parse(secondPointer).key).not.toBe(JSON.parse(pointer).key);
  });

  it('fails clearly before a database write if large-payload storage is unavailable', async () => {
    await expect(encodeDraftPayload('中'.repeat(30_000), 'large', undefined, encrypt)).rejects.toThrow('需要文件存储保存');
    const storage = setup();
    storage.put.mockRejectedValueOnce(new Error('private service detail'));
    await expect(encodeDraftPayload('中'.repeat(30_000), 'large', storage, encrypt)).rejects.toThrow('草稿文件保存失败');
  });

  it('rejects invalid pointers, missing blobs and undecryptable content', async () => {
    const storage = setup();
    await expect(decodeDraftPayload(JSON.stringify({ kind: 'encrypted-ai-draft-v1', key: 'other/file' }), storage, decrypt)).rejects.toThrow('存储不可用');
    const pointer = JSON.stringify({ kind: 'encrypted-ai-draft-v1', key: 'ai-draft-payloads/id/file.enc' });
    await expect(decodeDraftPayload(pointer, storage, decrypt)).rejects.toThrow('文件读取失败');
    storage.blobs.set('ai-draft-payloads/id/file.enc', 'invalid');
    await expect(decodeDraftPayload(pointer, storage, decrypt)).rejects.toThrow('文件读取失败');
  });
});
