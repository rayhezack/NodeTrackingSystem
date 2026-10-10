import worker, { resolvePolloCloudUser } from '../../worker';

describe('PolloCloud worker identity', () => {
  it('reads identity only from platform-injected headers', () => {
    const headers = new Headers({
      'x-pollocloud-user-id': 'user-123',
      'x-pollocloud-user-name': encodeURIComponent('Ray 测试'),
    });

    expect(resolvePolloCloudUser(headers)).toEqual({
      id: 'user-123',
      name: 'Ray 测试',
    });
  });

  it('does not accept identity from request data when the trusted header is absent', async () => {
    const response = await worker.fetch(new Request('https://example.test/api/me?user_id=forged'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
  });

  it('exposes a health endpoint without requiring identity', async () => {
    const response = await worker.fetch(new Request('https://example.test/api/health'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('does not call Feishu when the bitable route has no trusted identity', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const response = await worker.fetch(
      new Request('https://example.test/api/bitable/records?instance=workbench'),
      { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' },
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
