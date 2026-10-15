# AI 埋点设计 MVP

## Pollo 埋点治理 Skill

生产 Worker 与 Nest 服务使用同一份 `shared/pollo-tracking-policy.ts` 中文运行规则和 `shared/official-first-workflow.ts` 校验引擎。每次模型请求都加载规则，工作流版本为 `official-first-v2`。

1. 按需求所属端完整分页读取事件、参数、公共属性和枚举四张表，不带 UI 视图过滤，不截取前24个事件或前30条参数。任一表读取失败、字段结构不符或分页不完整时停止生成。
2. 模型先对照完整正式事件目录给出主板块、复用/新增决策和具体理由。新增必须列出比较过的正式事件；已有事件保持原ID。服务端拒绝废弃/待治理事件、伪造引用和已知重复别名。
3. 第二次模型请求携带选中事件的完整正式参数、现有公共属性、相关枚举及状态。模型只输出参数增量，服务端补齐未修改的正式参数，避免大段重复输出导致截断。
4. 校验正式记录来源、参数类型、必传条件、重复参数和公共属性；保留正式类型和历史大小写。扩枚举、参数草稿、触发口径变化及指标覆盖进入待确认项。结构通过不代表业务指标已经验收。
5. 草稿保存四表快照指纹、读取数量、主板块、逐事件理由及校验报告。人工应用前重新读取四表；旧版草稿或快照变化必须重新生成，确保写入前完成校验。

Web 使用正式事件 `tbly7VI4kwFz5qwR`、参数 `tblNAMKr5S38iXJQ`、公共属性 `tblb783YDTiBNts0`、枚举 `tbl2KEj2zyg8bOmk`。App 使用 `tblAhScEFQYAJC2g`、`tblEYv9lGZeenbT2`、`tblIdlancSXgX9VX`、`tblQ8Ph3N8GJHeVA`。设计工作台及同需求归档记录仅提供背景，不是正式事件存在的证据。

草稿界面显示复用数量、新增建议、正式库读取数量和通过/待确认状态。当前实现对语义复用使用模型比较及明确别名防护；不声称能机械识别所有同义事件。完整性检查也不能替代人工确认PRD指标及归因窗口。

该接入只生成草稿；人工选择后仍走现有草稿应用与评审流程，不会自动更新正式库。

## 生成连接与错误处理

生产前端使用 `POST /api/tracking/ai/records/:recordId/drafts?stream=1`。Worker 立即发送 JSON 前导空白，并每 10 秒发送空白保持响应活跃，完成后返回完整 JSON；模型请求也使用流式响应。整个生成请求最长 5 分钟，客户端关闭连接会取消后续网络请求。

流式响应已经发出 HTTP 200 时，后续失败以 `{ generationError: true, status, message }` 返回，前端必须检查该标记，不能把 HTTP 200 当作生成成功。未带 `stream=1` 的接口保持原有返回方式。

上游 408/504/524、非 JSON 网关响应、连接中断、模型输出截断均返回明确提示。只有收到完整模型输出且通过现有设计校验后才保存草稿。本机制不提供断开页面后继续生成的后台任务保证；真正的模型服务超时仍需用户重试。

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
- 模型单次最多20个事件、单事件100个增量参数、总计400个；超限报错而非截断。服务端完整保留正式参数。
- 草稿应用先按可信用户校验设计和参数权限，再批量写入 Base。

## 验证清单

1. `GET /api/tracking/ai/config` 返回 `configured: true`。
2. 点击“授权并生成初稿”可完成 OAuth，随后状态返回 `authorized: true`。
3. 私有 wiki/docx 能读取；无权限文档返回明确错误。
4. Kimi 返回的事件与参数可预览，确认后批量写入当前需求。
5. 更换 `FEISHU_TOKEN_ENCRYPTION_KEY` 后，旧 Token 无法解密，所有分析师需要重新授权。

完整设计规范见 [埋点设计规范 V1](TRACKING_DESIGN_GUIDELINES_V1.md)。

## 大草稿存储

PolloCloud 数据库单字段上限为 64 KB。草稿超过 60,000 字节时，先用服务端密钥加密并存入应用文件存储，数据库仅保留指针；读取仍先按用户与需求校验数据库记录，再解密文件。旧版内联 JSON 草稿可继续读取。应用文件存储中不保存草稿明文，文件保存失败时不写入指针，页面保留错误提示供排查。
