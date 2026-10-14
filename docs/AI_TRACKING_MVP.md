# AI 埋点设计 MVP

## Pollo 埋点治理 Skill

生产 Worker 在 `worker/pollo-tracking-governance-skill.ts` 中内置中文版运行规则，并在每次模型请求的 system 消息中加载。规则覆盖业务板块、Web/App 归属、复用优先级、事件和参数规范、触发时机及待确认项。

生成时按需求所属端读取正式事件库的全部分页，再按需求和 PRD 相关性选取最多 24 个事件，集中读取其正式参数，每事件向模型提供最多 30 个参数。Web 使用正式表 `tbly7VI4kwFz5qwR` / `tblNAMKr5S38iXJQ`，App 使用 `tblAhScEFQYAJC2g` / `tblEYv9lGZeenbT2`；设计工作台不作为正式事件存在的证据。

生成后校验复用来源 recordId 与 evt_id、正式库同名事件及上下文读取情况，并在草稿界面显示复用来源、设计依据、条件说明和待确认项。候选截断、读取失败时不能断言事件不存在。当前未独立读取公共属性表和枚举字典，因此公共属性去重与字典口径始终保留人工确认项。

该接入只生成草稿；人工选择后仍走现有草稿应用与评审流程，不会自动更新正式库。

## PolloCloud Worker 配置

AI 草稿、飞书文档 OAuth 和模型调用均由 PolloCloud Worker 执行。该功能确实需要多人共享、长期保存 OAuth Token 与草稿，因此 `pollocloud.json` 保留 `db: true`；首次发布前必须先联系 PolloCloud 管理员为 `app-tracking-management` 开通 D1。Token 写入前使用 AES-GCM 加密。

| key | 示例/说明 |
|---|---|
| `FEISHU_APP_ID` | 现有飞书自建应用 App ID |
| `FEISHU_APP_SECRET` | 现有飞书自建应用 Secret |
| `FEISHU_TOKEN_ENCRYPTION_KEY` | 独立生成的 32 字节以上随机 Secret |
| `KIMI_API_KEY` | Kimi 或公司兼容网关 Secret |
| `AI_BASE_URL` | 已写入 `pollocloud.json.vars`：`https://api.moonshot.cn/v1` |
| `AI_MODEL` | 已写入 `pollocloud.json.vars`：`kimi-k3` |
| `FEISHU_OAUTH_REDIRECT_URI` | 已写入 `pollocloud.json.vars` |
| `TRACKING_APP_URL` | 已写入 `pollocloud.json.vars`，用于机器人卡片跳转 |

公开地址和模型名写入 `pollocloud.json.vars`。以下敏感值只通过管道设置为 PolloCloud Secret，不能写入仓库、`vars`、命令参数或日志：

```bash
printf '%s' "$FEISHU_APP_ID" | pollocloud secret set --name app-tracking-management FEISHU_APP_ID
printf '%s' "$FEISHU_APP_SECRET" | pollocloud secret set --name app-tracking-management FEISHU_APP_SECRET
printf '%s' "$FEISHU_TOKEN_ENCRYPTION_KEY" | pollocloud secret set --name app-tracking-management FEISHU_TOKEN_ENCRYPTION_KEY
printf '%s' "$KIMI_API_KEY" | pollocloud secret set --name app-tracking-management KIMI_API_KEY
pollocloud secret list --name app-tracking-management
```

设置 Secret 前先执行 `pollocloud whoami` 和 `pollocloud list` 核对身份与目标应用。Secret 设置后通常 1-2 分钟生效，无需重新发布；命令只检查名称是否存在，无法读取明文。

## 飞书应用配置

1. 在现有自建应用的安全设置中添加 OAuth 回调 URL；必须与最终域名完全一致。
2. 申请并发布 `docx:document:readonly`、`wiki:node:read`、`auth:user.id:read`、`offline_access`。
3. Base 读写需要多维表格相应权限；人员搜索和通知需要通讯录读取、机器人发消息权限。
4. 确保机器人可用范围包含需要接收流程通知的员工，并发布新的飞书应用版本。
5. 权限变更后，历史用户 Token 不会自动得到新 Scope，分析师需要重新授权。

PolloCloud 登录仅负责访问控制，不能替代文档 OAuth。每位分析师首次生成草稿时仍需授权，文档读取权限与该分析师在飞书中的实际权限一致。

## 安全边界

- Worker 只信任 `x-pollocloud-user-id`，忽略浏览器提交的 `actorId`。
- OAuth `state` 使用 AES-GCM 加密并设置 10 分钟有效期；PKCE 使用 `S256`。
- OAuth Token 加密后存入应用独享 D1，模型 Key 和飞书 Secret 只在 Worker 读取。
- PRD 仅支持飞书 `wiki/docx`，正文最多取 36,000 字符；补充文件最多 5 个、总计 24,000 字符。
- AI 草稿持久化到 D1；重新发布 Worker 不会丢失草稿或授权。
- 单次最多 20 个事件、单事件 50 个参数、总计 200 个参数。
- 草稿应用先按可信用户校验设计和参数权限，再批量写入 Base。

## 验证清单

1. `GET /api/tracking/ai/config` 返回 `configured: true`。
2. 点击“授权并生成初稿”可完成 OAuth，随后状态返回 `authorized: true`。
3. 私有 wiki/docx 能读取；无权限文档返回明确错误。
4. Kimi 返回的事件与参数可预览，确认后批量写入当前需求。
5. 更换 `FEISHU_TOKEN_ENCRYPTION_KEY` 后，旧 Token 无法解密，所有分析师需要重新授权。

完整设计规范见 [埋点设计规范 V1](TRACKING_DESIGN_GUIDELINES_V1.md)。
