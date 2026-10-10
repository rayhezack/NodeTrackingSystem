import {
  getPolloCloudCurrentUser,
  normalizePolloCloudCurrentUser,
} from '../../client/src/api/pollocloud';

describe('normalizePolloCloudCurrentUser', () => {
  it('loads the normalized identity from the application worker', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ user_id: 'user-123', name: 'Ray' }),
    } as Response);

    await expect(getPolloCloudCurrentUser()).resolves.toEqual({
      user_id: 'user-123',
      name: 'Ray',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.objectContaining({
      credentials: 'same-origin',
    }));

    fetchMock.mockRestore();
  });

  it('normalizes the platform response and keeps available Feishu identifiers', () => {
    expect(normalizePolloCloudCurrentUser({
      data: {
        userId: 'user-123',
        userName: ' Ray ',
        enterpriseEmail: 'ray@example.com',
        openId: 'ou_123',
      },
    })).toEqual({
      user_id: 'user-123',
      name: 'Ray',
      email: 'ray@example.com',
      open_id: 'ou_123',
    });
  });

  it('rejects a response without a stable user id', () => {
    expect(() => normalizePolloCloudCurrentUser({ name: 'Ray' })).toThrow(
      'Current user response does not contain a user id',
    );
  });
});
