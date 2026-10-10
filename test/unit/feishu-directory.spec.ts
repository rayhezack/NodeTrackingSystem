import {
  listDirectoryUsersByIds,
  resetDirectoryCache,
  resolveDirectoryUserByName,
  searchDirectoryDepartments,
  searchDirectoryUsers,
} from '../../worker/feishu-directory';
import { resetFeishuTokenCache } from '../../worker/feishu-token';

describe('PolloCloud Feishu directory client', () => {
  beforeEach(() => {
    resetFeishuTokenCache();
    resetDirectoryCache();
  });

  it('searches and normalizes tenant users', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { items: [{ department_id: 'dept-1', name: '产品研发' }], has_more: false },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          items: [
            { user_id: 'u-1', open_id: 'ou-1', name: '张三', email: 'zhangsan@example.com', avatar: { avatar_origin: 'https://avatar' } },
            { user_id: 'u-2', open_id: 'ou-2', name: '李四' },
          ],
        },
      }));

    const result = await searchDirectoryUsers(
      credentials,
      '张',
      100,
      fetchMock as unknown as typeof fetch,
    ) as any;

    expect(result.data.userList).toEqual([
      expect.objectContaining({ userID: 'u-1', larkUserID: 'ou-1', name: { zh_cn: '张三' }, avatar: 'https://avatar' }),
    ]);
    expect(fetchMock.mock.calls[1][0]).toContain('/contact/v3/departments/0/children?');
    expect(fetchMock.mock.calls[2][0]).toContain('/contact/v3/users/find_by_department?department_id=0');
    expect(fetchMock.mock.calls[3][0]).toContain('/contact/v3/users/find_by_department?department_id=dept-1');
  });

  it('resolves an exact unique user name across departments', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [{ department_id: 'dept-1' }], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [{ user_id: 'sunwen-1663469', name: '孙文' }], has_more: false } }));

    await expect(resolveDirectoryUserByName(
      credentials,
      '孙文',
      fetchMock as unknown as typeof fetch,
    )).resolves.toEqual(expect.objectContaining({ user_id: 'sunwen-1663469', name: '孙文' }));
  });

  it('loads users by id from the user detail API and preserves the requested keys', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { user: 'ignored' } }, 404))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { user: { user_id: 'u-2', open_id: 'ou-2', name: '李四', avatar: { avatar_origin: 'https://avatar/u-2' } } },
      }));

    const result = await listDirectoryUsersByIds(
      credentials,
      ['u-1', 'u-2'],
      fetchMock as unknown as typeof fetch,
    ) as any;

    expect(fetchMock.mock.calls[1][0]).toContain('/contact/v3/users/u-1?user_id_type=user_id');
    expect(fetchMock.mock.calls[2][0]).toContain('/contact/v3/users/u-2?user_id_type=user_id');
    expect(result.data.userInfoMap).toEqual({
      'u-2': expect.objectContaining({
        userID: 'u-2',
        avatar: { image: { large: 'https://avatar/u-2' } },
      }),
    });
  });

  it('requests child departments so the picker is not limited to root departments', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [] } }));

    await searchDirectoryDepartments(credentials, '', 100, fetchMock as unknown as typeof fetch);

    expect(fetchMock.mock.calls[1][0]).toContain('/contact/v3/departments/0/children?');
    expect(fetchMock.mock.calls[1][0]).toContain('fetch_child=true');
    expect(fetchMock.mock.calls[1][0]).toContain('page_size=50');
  });
});

const credentials = { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
