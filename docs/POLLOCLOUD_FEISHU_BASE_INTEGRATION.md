# PolloCloud 接入飞书 Base 与通讯录说明

## 1. 核心结论

PolloCloud 负责应用托管、飞书登录验证和 Worker 运行环境，但不会自动授予飞书 OpenAPI 权限。

部署在 PolloCloud 上的应用如需读取 Base、查询人员或发送机器人消息，仍需使用飞书自建应用的 `App ID` 和 `App Secret` 获取 `tenant_access_token`，再由 Worker 调用飞书 OpenAPI。

完整链路如下：

```text
同事登录 PolloCloud
        ↓
PolloCloud 向 Worker 注入当前用户请求头
        ↓
Worker 使用 FEISHU_APP_ID + FEISHU_APP_SECRET
        ↓
获取 tenant_access_token
        ↓
调用飞书 Base、通讯录或机器人 OpenAPI
```

需要特别区分：

- `x-pollocloud-user-id`、`x-pollocloud-user-name`：表示当前登录 PolloCloud 的用户。
- `tenant_access_token`：表示飞书自建应用的身份，用于访问 Base、通讯录和机器人 API。
- `FEISHU_APP_ID`、`FEISHU_APP_SECRET`：不是妙搭专属变量，而是调用飞书 OpenAPI 的应用凭证。

## 2. 接入前准备

需要准备以下信息：

| 配置 | 说明 | 是否敏感 |
| --- | --- | --- |
| 飞书自建应用 App ID | 用于获取 `tenant_access_token` | 否，但建议统一作为 PolloCloud Secret 管理 |
| 飞书自建应用 App Secret | 用于获取 `tenant_access_token` | 是 |
| Base `app_token` | Base 的唯一标识 | 否 |
| 数据表 `table_id` | Base 中具体数据表的标识 | 否 |
| PolloCloud 应用名 | 对应 `https://应用名.pollocloud.com` | 否 |

Base 链接一般为：

```text
https://example.feishu.cn/base/{app_token}?table={table_id}
```

- `app_token` 位于 `/base/` 后面。
- `table_id` 通常以 `tbl` 开头，可从 URL 的 `table` 参数或飞书 API 调试台获取。

## 3. 飞书 Base 权限

### 3.1 应用 Scope

只读取 Base 时，建议按最小权限开通：

| 使用场景 | 权限名称 | Scope |
| --- | --- | --- |
| 查询 Base 记录 | 查看 Base 记录 | `base:record:retrieve` |
| Base 通用只读访问 | 查看、评论和导出 Base | `bitable:app:readonly` |
| 新增、修改或删除记录 | 查看、评论、编辑和管理 Base | `bitable:app` |

飞书部分接口会提示以下三个权限任选其一：

```text
bitable:app
bitable:app:readonly
base:record:retrieve
```

推荐选择：

- 纯查询应用：开通 `base:record:retrieve`，必要时补充 `bitable:app:readonly`。
- 需要写入、修改或删除记录：开通 `bitable:app`。
- 不要因为排错方便就给纯查询应用开放写权限。

如果 Base 中包含人员字段，并希望 API 返回姓名、头像或 `user_id`，还需要通讯录字段权限，见第 4 节。

### 3.2 Base 文档授权

开通应用 Scope 后，还必须给目标 Base 授权：

1. 打开目标 Base。
2. 点击右上角 `...`。
3. 进入 `更多` → `添加文档应用`。
4. 搜索并添加对应的飞书自建应用。
5. 授予只读或编辑权限。

如果 Base 开启了高级权限，还需要把应用加入相应权限组，并授权目标数据表、字段或记录范围。

应用 Scope 和 Base 文档授权缺一不可：

| 配置状态 | 结果 |
| --- | --- |
| 有 Scope，没有添加文档应用 | 无法访问该 Base |
| 添加了文档应用，没有 Scope | OpenAPI 返回权限不足 |
| 两者都有，但高级权限未包含应用 | 可能返回 `1254302` |
| 两者都有，且权限范围正确 | 可以正常访问 |

## 4. 飞书人员、部门与头像权限

### 4.1 推荐权限

查询企业人员和部门时，建议开通以下应用身份权限：

| 用途 | Scope |
| --- | --- |
| 允许应用身份读取通讯录 | `contact:contact:readonly_as_app` |
| 获取用户姓名、英文名和头像 | `contact:user.base:readonly` |
| 获取部门 ID 和名称 | `contact:department.base:readonly` |
| 获取用户所属部门 | `contact:user.department:readonly` |
| 在接口返回中获取用户 `user_id` | `contact:user.employee_id:readonly` |
| 通过邮箱或手机号查询用户 ID | `contact:user.id:readonly` |
| 获取用户邮箱 | `contact:user.email:readonly` |

飞书控制台可能将旧版总权限拆分成更细的字段权限。配置时应以具体 API 右侧的“开通权限”列表为准。

### 4.2 通讯录数据范围

开通 Scope 后，还需要设置“权限可访问的数据范围”：

- `全部成员`：应用可读取全公司通讯录。
- `与应用的可用范围一致`：只能读取应用可用范围内的人员。
- `部分成员`：只能读取指定部门或人员。

如果应用需要提供全公司人员搜索，应选择 `全部成员`；如果只面向某个团队，应按最小范围授权。

常见现象：接口调用成功，但部分人员、部门或头像缺失。这通常不是代码问题，而是通讯录数据范围没有覆盖对应人员。

### 4.3 推荐查询链路

查询整个通讯录时，可以先读取部门，再按部门读取直属成员：

```text
GET /open-apis/contact/v3/departments/0/children
GET /open-apis/contact/v3/users/find_by_department
GET /open-apis/contact/v3/users/{user_id}
```

人员头像通常位于：

```text
avatar.avatar_origin
avatar.avatar_240
```

Base 人员字段如果已经返回 `avatar_url`，可优先直接使用，减少通讯录 API 请求。

### 4.4 业务角色不能从通讯录推断

飞书通讯录提供姓名、头像、部门、邮箱和用户 ID，但不会返回业务系统中的 Owner、管理员、研发负责人等角色。

业务角色应来自以下任一来源：

- Base 中的角色或负责人字段。
- 应用自己的数据库或权限配置。
- 明确维护的 `user_id` 与角色映射。

不要使用姓名作为长期角色主键，同名人员会导致错误匹配。优先使用租户级 `user_id`。

## 5. PolloCloud 配置

### 5.1 `pollocloud.json`

非敏感配置可以写入 `vars`：

```json
{
  "name": "example-app",
  "dir": "dist/pollocloud",
  "spa": true,
  "worker": "worker/index.ts",
  "immutable": ["/assets/*"],
  "vars": {
    "FEISHU_BASE_APP_TOKEN": "your_base_app_token",
    "FEISHU_BASE_TABLE_ID": "your_table_id"
  }
}
```

如果应用不需要 PolloCloud D1，不要添加 `"db": true`。

### 5.2 设置密钥

App Secret 必须使用 PolloCloud Secret 保存，不得写入代码、`.env`、`pollocloud.json` 或 Git：

```bash
printf '%s' "$FEISHU_APP_ID" \
  | pollocloud secret set --name example-app FEISHU_APP_ID

printf '%s' "$FEISHU_APP_SECRET" \
  | pollocloud secret set --name example-app FEISHU_APP_SECRET

pollocloud secret list --name example-app
```

`secret list` 只显示密钥名称，不会显示明文。

## 6. Worker 最小实现

### 6.1 获取 `tenant_access_token`

```ts
interface Env {
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_BASE_APP_TOKEN?: string;
  FEISHU_BASE_TABLE_ID?: string;
}

async function getTenantAccessToken(env: Env): Promise<string> {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    throw new Error('Feishu app credentials are not configured');
  }

  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: env.FEISHU_APP_ID,
        app_secret: env.FEISHU_APP_SECRET,
      }),
    },
  );

  const payload = await response.json() as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
  };

  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(`Feishu token request failed: ${payload.msg || response.status}`);
  }

  return payload.tenant_access_token;
}
```

生产代码应缓存 Token，并在过期前刷新，避免每个请求都重新申请。

### 6.2 查询 Base 记录

```ts
async function searchBaseRecords(env: Env): Promise<unknown> {
  if (!env.FEISHU_BASE_APP_TOKEN || !env.FEISHU_BASE_TABLE_ID) {
    throw new Error('Feishu Base configuration is incomplete');
  }

  const token = await getTenantAccessToken(env);
  const url = [
    'https://open.feishu.cn/open-apis/bitable/v1/apps',
    encodeURIComponent(env.FEISHU_BASE_APP_TOKEN),
    'tables',
    encodeURIComponent(env.FEISHU_BASE_TABLE_ID),
    'records/search?user_id_type=user_id',
  ].join('/');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 100 }),
  });

  const payload = await response.json() as {
    code?: number;
    msg?: string;
    data?: unknown;
  };

  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu Base request failed: ${payload.msg || response.status}`);
  }

  return payload.data;
}
```

### 6.3 读取 PolloCloud 当前用户

```ts
function getCurrentPolloCloudUser(request: Request) {
  const userId = request.headers.get('x-pollocloud-user-id')?.trim();
  const encodedName = request.headers.get('x-pollocloud-user-name') || '';

  if (!userId) return null;

  return {
    id: userId,
    name: decodeURIComponent(encodedName),
  };
}
```

不要信任前端主动提交的用户 ID。用户身份应只从 PolloCloud 注入的请求头读取。

如果需要把 PolloCloud 用户映射为飞书通讯录 `user_id`，应建立明确映射，优先使用邮箱或稳定 ID；姓名匹配只能作为首次绑定的辅助方式，并且必须处理同名情况。

## 7. 机器人消息权限（可选）

如果应用还需要继续通过机器人发送消息，需要：

1. 在飞书应用中启用机器人能力。
2. 开通以下任一消息权限：
   - `im:message`
   - `im:message:send_as_bot`
3. 发布新的飞书应用版本。
4. 确认收件人在机器人的可用范围内。
5. 使用同一个飞书应用的 `tenant_access_token` 调用：

```text
POST /open-apis/im/v1/messages?receive_id_type=user_id
```

不同飞书应用生成的 `open_id` 不能直接混用。跨应用投递时优先使用租户级 `user_id`，或通过邮箱、手机号重新解析当前应用下可用的身份。

## 8. 飞书文档读取与 Base 权限不同

读取 Base 和读取飞书文档是两套权限：

- Base：使用应用身份 `tenant_access_token` 即可完成大部分服务端读写。
- 飞书文档/Wiki：如果需要按当前用户权限读取私人文档，通常需要用户 OAuth。

常见文档 OAuth Scope：

```text
offline_access
docx:document:readonly
wiki:node:read
auth:user.id:read
```

不要因为应用能读取 Base，就假设它也能读取任意飞书文档。

## 9. 发布与验证顺序

推荐严格按照以下顺序操作：

1. 创建或选择飞书自建应用。
2. 开通 Base、通讯录和消息权限。
3. 配置通讯录数据范围。
4. 在目标 Base 中添加文档应用。
5. 如果启用了 Base 高级权限，将应用加入对应权限组。
6. 在飞书开放平台创建版本并发布。
7. 在 PolloCloud 设置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`。
8. 检查 `pollocloud.json` 中的 Base Token 和 Table ID。
9. 构建并部署应用。
10. 分别验证 Base 查询、人员姓名、头像和 `user_id`。

示例命令：

```bash
npm run build:pollocloud
pollocloud whoami
pollocloud list
pollocloud secret list --name example-app
pollocloud deploy
```

## 10. 常见报错

### `400 Access denied` / `99991672`

原因：飞书应用没有开通接口要求的 Scope，或权限修改后没有发布新版本。

处理：打开报错中的权限申请链接，开通对应的应用身份权限，然后创建并发布新版本。

### `91403 Forbidden`

原因：飞书应用有 API Scope，但没有被添加到目标 Base。

处理：在 Base 的“添加文档应用”中加入该应用。

### `1254302 Permission denied`

原因：Base 开启了高级权限，但应用不在有权访问目标表或记录的权限组中。

处理：将应用加入对应高级权限组，并授予所需读写权限。

### 只能读取部分人员

原因：通讯录数据范围只覆盖了部分部门或成员。

处理：调整“权限可访问的数据范围”，并重新发布应用版本。

### 有姓名但没有头像

原因通常包括：

- 缺少 `contact:user.base:readonly`。
- Base 人员字段没有返回 `avatar_url`。
- 通讯录 API 的数据范围不包含该人员。
- 前端只使用了姓名，没有读取 `avatar.avatar_origin`。

### 人员能找到，但机器人消息发送失败

原因通常包括：

- 机器人能力未启用。
- 缺少 `im:message` 或 `im:message:send_as_bot`。
- 收件人不在应用可用范围内。
- 使用了另一个飞书应用生成的 `open_id`。

## 11. 最小权限模板

另一个 PolloCloud 项目如果只读取 Base，不需要人员搜索，建议使用：

```text
base:record:retrieve
```

如果 Base 中包含人员字段，并需要展示姓名、头像和稳定的 `user_id`，补充：

```text
contact:user.base:readonly
contact:user.employee_id:readonly
```

如果还需要搜索全公司人员和部门，补充：

```text
contact:contact:readonly_as_app
contact:department.base:readonly
contact:user.department:readonly
```

如果需要通过邮箱或手机号匹配用户，补充：

```text
contact:user.id:readonly
contact:user.email:readonly
```

## 12. 官方参考

- [飞书 Base 页面查询与编辑权限配置](https://www.feishu.cn/content/137710114294)
- [飞书 Base 创建记录 API](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create)
- [获取部门直属用户列表](https://open.feishu.cn/document/server-docs/contact-v3/user/find_by_department)
- [获取子部门列表](https://open.feishu.cn/document/server-docs/contact-v3/department/children)
- [飞书应用身份读取通讯录示例](https://open.feishu.cn/solutions/detail/leave_connector?lang=zh-CN)
- [飞书发送消息 API](https://open.feishu.cn/document/server-docs/im-v1/message/create)
