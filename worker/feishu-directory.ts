import { getFeishuTenantToken, type FeishuCredentials } from './feishu-token';

type FetchLike = typeof fetch;

export type FeishuDirectoryUser = {
  user_id?: string;
  open_id?: string;
  name?: string;
  email?: string;
  avatar?: { avatar_origin?: string; avatar_240?: string };
  department_ids?: string[];
  status?: { is_frozen?: boolean; is_resigned?: boolean };
};

type FeishuDepartment = {
  department_id?: string;
  open_department_id?: string;
  name?: string;
};

type FeishuChat = {
  chat_id?: string;
  name?: string;
  avatar?: string;
  user_count?: number;
  external?: boolean;
};

type DirectoryCache<T> = {
  expiresAt: number;
  value: T;
};

const DIRECTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const FEISHU_PAGE_SIZE = 50;
let departmentCache: DirectoryCache<FeishuDepartment[]> | null = null;
let userCache: DirectoryCache<FeishuDirectoryUser[]> | null = null;
let departmentPending: Promise<FeishuDepartment[]> | null = null;
let userPending: Promise<FeishuDirectoryUser[]> | null = null;

export async function searchDirectoryUsers(
  credentials: FeishuCredentials,
  query: string,
  pageSize: number,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const directoryUsers = await listAllDirectoryUsers(credentials, fetchImpl);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const users = directoryUsers
    .filter((user) => {
      if (!normalizedQuery) return true;
      return [user.name, user.email, user.user_id, user.open_id]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
    })
    .slice(0, clampResultSize(pageSize));
  return {
    data: { userList: users.map(toUserInfo), total: users.length },
    status_code: '0',
  };
}

export async function resolveDirectoryUserByName(
  credentials: FeishuCredentials,
  name: string,
  fetchImpl: FetchLike = fetch,
): Promise<FeishuDirectoryUser | null> {
  const normalizedName = name.trim().toLocaleLowerCase();
  if (!normalizedName) return null;
  const matches = (await listAllDirectoryUsers(credentials, fetchImpl))
    .filter((user) => user.name?.trim().toLocaleLowerCase() === normalizedName);
  if (matches.length > 1) {
    throw new Error(`飞书通讯录中存在 ${matches.length} 个同名用户“${name.trim()}”，无法唯一确认当前身份`);
  }
  return matches[0] || null;
}

export async function listDirectoryUsersByIds(
  credentials: FeishuCredentials,
  userIds: string[],
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))].slice(0, 20);
  if (!ids.length) return { data: { userInfoMap: {} } };
  const results = await Promise.allSettled(ids.map((id) => callFeishu<FeishuDirectoryUser | { user?: FeishuDirectoryUser }>(
    credentials,
    `/open-apis/contact/v3/users/${encodeURIComponent(id)}?user_id_type=user_id`,
    { method: 'GET' },
    fetchImpl,
  )));
  const userInfoMap = Object.fromEntries(results.flatMap((result, index) => {
    if (result.status !== 'fulfilled') return [];
    const user = toUserInfo(unwrapDirectoryUser(result.value));
    return [[ids[index], {
      ...user,
      avatar: { image: { large: user.avatar } },
    }]];
  }));
  return { data: { userInfoMap } };
}

export async function getDirectoryUserByEmail(
  credentials: FeishuCredentials,
  email: string,
  fetchImpl: FetchLike = fetch,
): Promise<FeishuDirectoryUser | null> {
  const normalizedEmail = email.trim().toLocaleLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) return null;
  try {
    const payload = await callFeishu<{ user_list?: FeishuDirectoryUser[] }>(
      credentials,
      '/open-apis/contact/v3/users/batch_get_id?user_id_type=user_id',
      {
        method: 'POST',
        body: JSON.stringify({ emails: [normalizedEmail], include_resigned: false }),
      },
      fetchImpl,
    );
    const matched = (payload.user_list || []).find((user) => user.email?.trim().toLocaleLowerCase() === normalizedEmail);
    return matched || payload.user_list?.[0] || null;
  } catch {
    return null;
  }
}

export async function getDirectoryUserProfile(
  credentials: FeishuCredentials,
  userId: string,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const payload = await callFeishu<FeishuDirectoryUser | { user?: FeishuDirectoryUser }>(
    credentials,
    `/open-apis/contact/v3/users/${encodeURIComponent(userId)}?user_id_type=user_id`,
    { method: 'GET' },
    fetchImpl,
  );
  const user = toUserInfo(unwrapDirectoryUser(payload));
  return {
    useLarkCard: false,
    userProfileInfo: {
      name: user.name.zh_cn,
      avatar: user.avatar,
      email: user.email,
      userStatus: user.userType === '_employee' ? 2 : 0,
      userType: user.userType === '_employee' ? '_employee' : '_externalUser',
    },
  };
}

export async function searchDirectoryDepartments(
  credentials: FeishuCredentials,
  query: string,
  pageSize: number,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const departments = (await listAllDirectoryDepartments(credentials, fetchImpl))
    .filter((department) => !normalizedQuery || department.name?.toLocaleLowerCase().includes(normalizedQuery))
    .slice(0, clampResultSize(pageSize));
  return {
    data: {
      departmentList: departments.map((department) => ({
        departmentID: department.department_id || '',
        larkDepartmentID: department.department_id || '',
        openDepartmentID: department.open_department_id,
        name: { zh_cn: department.name || '' },
      })),
      total: departments.length,
    },
    status_code: '0',
  };
}

export async function searchDirectoryChats(
  credentials: FeishuCredentials,
  query: string,
  pageSize: number,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const payload = await callFeishu<{ items?: FeishuChat[] }>(
    credentials,
    `/open-apis/im/v1/chats?page_size=${clampResultSize(pageSize)}&sort_type=ByCreateTimeAsc`,
    { method: 'GET' },
    fetchImpl,
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const chats = (payload.items || []).filter((chat) => !normalizedQuery || chat.name?.toLocaleLowerCase().includes(normalizedQuery));
  return {
    data: { result: { chatResult: { total: chats.length, items: chats.map(toChatInfo) } } },
    status_code: '0',
  };
}

export async function listDirectoryChatsByIds(
  credentials: FeishuCredentials,
  chatIds: string[],
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const ids = [...new Set(chatIds.map((id) => id.trim()).filter(Boolean))].slice(0, 20);
  const results = await Promise.all(ids.map((id) => callFeishu<FeishuChat>(
    credentials,
    `/open-apis/im/v1/chats/${encodeURIComponent(id)}`,
    { method: 'GET' },
    fetchImpl,
  )));
  return { data: { chatInfoMap: Object.fromEntries(results.map((chat, index) => [ids[index], toChatInfo(chat)])) }, status_code: '0' };
}

function toUserInfo(user: FeishuDirectoryUser) {
  const id = user.user_id || user.open_id || '';
  return {
    userID: id,
    larkUserID: user.open_id || id,
    employeeID: user.user_id,
    larkID: user.open_id,
    name: { zh_cn: user.name || id },
    avatar: user.avatar?.avatar_origin || user.avatar?.avatar_240 || '',
    userType: '_employee' as const,
    department: { departmentID: user.department_ids?.[0] || '', name: { zh_cn: '' } },
    email: user.email,
  };
}

function unwrapDirectoryUser(payload: FeishuDirectoryUser | { user?: FeishuDirectoryUser }): FeishuDirectoryUser {
  const nestedUser = (payload as { user?: FeishuDirectoryUser }).user;
  return nestedUser || payload as FeishuDirectoryUser;
}

function toChatInfo(chat: FeishuChat) {
  const id = chat.chat_id || '';
  return {
    chatID: id,
    openChatID: id,
    name: { zh_cn: chat.name || id },
    avatar: chat.avatar || '',
    isExternal: chat.external,
    userCount: chat.user_count,
  };
}

async function listAllDirectoryUsers(
  credentials: FeishuCredentials,
  fetchImpl: FetchLike,
): Promise<FeishuDirectoryUser[]> {
  if (fetchImpl === fetch && userCache && userCache.expiresAt > Date.now()) return userCache.value;
  if (fetchImpl === fetch && userPending) return userPending;

  const load = async () => {
    const departments = await listAllDirectoryDepartments(credentials, fetchImpl);
    const userLists = await Promise.all([
      '0',
      ...departments.map((department) => department.department_id || '').filter(Boolean),
    ].map((departmentId) => listDepartmentUsers(credentials, departmentId, fetchImpl)));
    const users = [...new Map(userLists.flat()
      .filter((user) => !user.status?.is_resigned)
      .map((user) => [user.user_id || user.open_id || '', user] as const)
      .filter(([id]) => Boolean(id))).values()];
    if (fetchImpl === fetch) userCache = { expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS, value: users };
    return users;
  };

  if (fetchImpl !== fetch) return load();
  userPending = load();
  try {
    return await userPending;
  } finally {
    userPending = null;
  }
}

async function listAllDirectoryDepartments(
  credentials: FeishuCredentials,
  fetchImpl: FetchLike,
): Promise<FeishuDepartment[]> {
  if (fetchImpl === fetch && departmentCache && departmentCache.expiresAt > Date.now()) return departmentCache.value;
  if (fetchImpl === fetch && departmentPending) return departmentPending;

  const load = async () => {
    const departments: FeishuDepartment[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const params = new URLSearchParams({
        fetch_child: 'true',
        page_size: String(FEISHU_PAGE_SIZE),
        department_id_type: 'department_id',
        user_id_type: 'user_id',
      });
      if (pageToken) params.set('page_token', pageToken);
      const payload = await callFeishu<{ items?: FeishuDepartment[]; has_more?: boolean; page_token?: string }>(
        credentials,
        `/open-apis/contact/v3/departments/0/children?${params.toString()}`,
        { method: 'GET' },
        fetchImpl,
      );
      departments.push(...(payload.items || []));
      if (!payload.has_more || !payload.page_token) break;
      pageToken = payload.page_token;
      if (page === 19) throw new Error('Feishu department pagination exceeded 20 pages');
    }
    if (fetchImpl === fetch) departmentCache = { expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS, value: departments };
    return departments;
  };

  if (fetchImpl !== fetch) return load();
  departmentPending = load();
  try {
    return await departmentPending;
  } finally {
    departmentPending = null;
  }
}

async function listDepartmentUsers(
  credentials: FeishuCredentials,
  departmentId: string,
  fetchImpl: FetchLike,
): Promise<FeishuDirectoryUser[]> {
  const users: FeishuDirectoryUser[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      department_id: departmentId,
      page_size: String(FEISHU_PAGE_SIZE),
      department_id_type: 'department_id',
      user_id_type: 'user_id',
    });
    if (pageToken) params.set('page_token', pageToken);
    const payload = await callFeishu<{ items?: FeishuDirectoryUser[]; has_more?: boolean; page_token?: string }>(
      credentials,
      `/open-apis/contact/v3/users/find_by_department?${params.toString()}`,
      { method: 'GET' },
      fetchImpl,
    );
    users.push(...(payload.items || []));
    if (!payload.has_more || !payload.page_token) break;
    pageToken = payload.page_token;
    if (page === 19) throw new Error(`Feishu user pagination exceeded 20 pages for department ${departmentId}`);
  }
  return users;
}

async function callFeishu<T>(
  credentials: FeishuCredentials,
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<T> {
  const token = await getFeishuTenantToken(credentials, fetchImpl);
  const response = await fetchImpl(`https://open.feishu.cn${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json() as { code?: number; msg?: string; data?: T } & T;
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu directory request failed: ${response.status} ${payload.msg || 'unknown error'}`);
  }
  return (payload.data ?? payload) as T;
}

function clampResultSize(value: number): number {
  return Math.min(Math.max(Math.trunc(value || 100), 1), 100);
}

export function resetDirectoryCache(): void {
  departmentCache = null;
  userCache = null;
  departmentPending = null;
  userPending = null;
}
