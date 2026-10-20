import worker from '../../worker';
import * as files from '../../worker/feishu-files';

jest.mock('../../worker/pollocloud-identity', () => ({ resolveCanonicalIdentity: jest.fn(async () => ({ id: 'trusted-user' })) }));

describe('UI image preview', () => {
  afterEach(() => jest.restoreAllMocks());

  function request(attachment: Record<string, unknown>, authenticated = true) {
    return new Request('https://example.test/api/tracking/ui-image-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authenticated ? { 'x-pollocloud-user-id': 'tester' } : {}) },
      body: JSON.stringify({ attachment }),
    });
  }

  it('refreshes a token attachment instead of returning its authenticated or expired URL', async () => {
    const resolve = jest.spyOn(files, 'getBitableMediaPreviewUrl').mockResolvedValue('https://example.test/fresh-image');
    const response = await worker.fetch(request({ file_token: 'token', url: 'https://example.test/expired', tmp_url: 'https://example.test/expired-too' }));
    expect(resolve).toHaveBeenCalledWith({}, 'token');
    expect(await response.json()).toEqual({ url: 'https://example.test/fresh-image', source: 'direct' });
  });

  it('retains direct previews for attachments without a Feishu token', async () => {
    const resolve = jest.spyOn(files, 'getBitableMediaPreviewUrl');
    const response = await worker.fetch(request({ url: 'https://example.test/image' }));
    expect(await response.json()).toEqual({ url: 'https://example.test/image', source: 'direct' });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('does not resolve attachments for unauthenticated requests', async () => {
    const resolve = jest.spyOn(files, 'getBitableMediaPreviewUrl');
    const response = await worker.fetch(request({ file_token: 'token' }, false));
    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });
});
