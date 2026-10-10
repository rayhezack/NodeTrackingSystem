import { getBitableMediaPreviewUrl, uploadBitableImage } from '../../worker/feishu-files';
import { resetFeishuTokenCache } from '../../worker/feishu-token';

describe('PolloCloud Feishu file client', () => {
  beforeEach(() => {
    resetFeishuTokenCache();
  });

  it('uploads an image to the selected Base application', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { file_token: 'file-token' } }));
    const file = new File(['image'], 'ui.png', { type: 'image/png' });

    const result = await uploadBitableImage(
      credentials,
      file,
      'web',
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual(expect.objectContaining({ id: 'file-token', fileToken: 'file-token' }));
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all');
    expect(request[1]?.headers).toEqual({ Authorization: 'Bearer tenant-token' });
    expect(request[1]?.body).toBeInstanceOf(FormData);
    expect((request[1]?.body as FormData).get('parent_node')).toBe('EX4RbTvp9agYNws6PIHcKD20nqf');
  });

  it('resolves a temporary preview URL from a Feishu file token', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { tmp_download_urls: [{ file_token: 'file-token', tmp_download_url: 'https://preview' }] },
      }));

    const result = await getBitableMediaPreviewUrl(
      credentials,
      'file-token',
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toBe('https://preview');
    expect(fetchMock.mock.calls[1][0]).toContain('file_tokens=file-token');
  });
});

const credentials = { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
