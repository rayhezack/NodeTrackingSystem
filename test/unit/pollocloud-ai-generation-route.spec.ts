import worker from '../../worker';
import { generateAiDraft } from '../../worker/ai-tracking';
import { TrackingWriteError } from '../../worker/tracking-write';
import { readAiGenerationStream } from '../../client/src/api/ai-generation-stream';

jest.mock('../../worker/ai-tracking', () => ({ generateAiDraft: jest.fn() }));
jest.mock('../../worker/pollocloud-identity', () => ({ resolveCanonicalIdentity: jest.fn(async () => ({ id: 'trusted-user' })) }));

describe('production AI generation route', () => {
  const generate = jest.mocked(generateAiDraft);
  const request = () => new Request('https://tracking.example/api/tracking/ai/records/web%3Arec-1/drafts?stream=1', {
    method: 'POST', headers: { 'x-pollocloud-user-id': 'platform-user', 'content-type': 'application/json' }, body: '{}',
  });
  afterEach(() => jest.clearAllMocks());

  it('returns a streaming response before a slow generation finishes and retains the trusted owner', async () => {
    let resolve!: (value: unknown) => void;
    generate.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const response = await worker.fetch(request());
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(generate.mock.calls[0][1]).toBe('web:rec-1');
    expect(generate.mock.calls[0][3]).toBe('trusted-user');
    resolve({ draft: { id: 'draft-1' } });
    await expect(response.json()).resolves.toEqual({ draft: { id: 'draft-1' } });
  });

  it('encodes a post-header timeout as a structured error instead of malformed JSON', async () => {
    generate.mockRejectedValue(new TrackingWriteError('大模型服务响应超时（HTTP 524）', 502));
    const response = await worker.fetch(request());
    await expect(response.json()).resolves.toEqual({ generationError: true, status: 502, message: '大模型服务响应超时（HTTP 524）' });
  });

  it('keeps the existing nonstream API error status for older clients', async () => {
    generate.mockRejectedValue(new TrackingWriteError('请先授权飞书文档', 401));
    const previous = request();
    const response = await worker.fetch(new Request(previous.url.split('?')[0], previous));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: '请先授权飞书文档' });
  });

  it('delivers stage progress and the final draft through the production v2 route', async () => {
    generate.mockImplementation(async (...args) => {
      args[6]?.({ stage: 'prd', message: '读取 PRD 正文' });
      return { draft: { id: 'draft-1' } } as never;
    });
    const previous = request();
    const response = await worker.fetch(new Request(previous.url.replace('stream=1', 'stream=2'), previous));
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const progress: string[] = [];
    await expect(readAiGenerationStream(response, (value) => progress.push(value.message)))
      .resolves.toEqual({ draft: { id: 'draft-1' } });
    expect(progress).toContain('读取 PRD 正文');
  });
});
