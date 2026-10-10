import type { D1Database, D1PreparedStatement } from '../../worker/ai-tracking';
import { resetDirectoryCache } from '../../worker/feishu-directory';
import { resetFeishuTokenCache } from '../../worker/feishu-token';
import { resetIdentitySchemaCache, resolveCanonicalIdentity } from '../../worker/pollocloud-identity';

describe('PolloCloud to Feishu identity mapping', () => {
  beforeEach(() => {
    resetFeishuTokenCache();
    resetDirectoryCache();
    resetIdentitySchemaCache();
  });

  it('maps a trusted platform user to the tenant user id and reuses D1 on later requests', async () => {
    const db = createIdentityDb();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [{ department_id: 'dept-1' }], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { items: [{ user_id: 'sunwen-1663469', open_id: 'ou-current-app', name: '孙文' }], has_more: false },
      }));
    const env = { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret', DB: db };
    const platformUser = { id: 'ou-pollocloud-app', name: '孙文' };

    await expect(resolveCanonicalIdentity(env, platformUser, fetchMock as unknown as typeof fetch)).resolves.toEqual({
      id: 'sunwen-1663469',
      name: '孙文',
      platformId: 'ou-pollocloud-app',
      openId: 'ou-current-app',
    });

    fetchMock.mockClear();
    await expect(resolveCanonicalIdentity(env, platformUser, fetchMock as unknown as typeof fetch)).resolves.toEqual(
      expect.objectContaining({ id: 'sunwen-1663469', platformId: 'ou-pollocloud-app' }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function createIdentityDb(): D1Database {
  const rows = new Map<string, { feishu_user_id: string; name: string; feishu_open_id: string; email: string }>();
  return {
    prepare(query: string): D1PreparedStatement {
      let values: unknown[] = [];
      const statement: D1PreparedStatement = {
        bind(...nextValues: unknown[]) {
          values = nextValues;
          return statement;
        },
        async first<T>() {
          if (!query.startsWith('SELECT')) return null;
          return (rows.get(String(values[0])) || null) as T | null;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
        async run() {
          if (query.startsWith('INSERT')) {
            rows.set(String(values[0]), {
              feishu_user_id: String(values[1]),
              name: String(values[2]),
              feishu_open_id: String(values[3]),
              email: String(values[4]),
            });
          }
          return {};
        },
      };
      return statement;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
