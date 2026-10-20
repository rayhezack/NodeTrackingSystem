# AI 埋点设计 MVP

## Pollo 埋点治理 Skill

专用 Skill 入口为 [`skills/pollo-tracking-design/SKILL.md`](../skills/pollo-tracking-design/SKILL.md)，复用契约和阶段协议放在其 `references/` 下。生产 Worker 与 Nest 服务按阶段加载 Skill 和对应参考资料，`shared/official-first-workflow.ts` 负责确定性校验，工作流版本为 `official-first-v3`。

`npm run skill:tracking:prepare` 将 Markdown 原文打包到 `shared/tracking-skill.generated.ts`；构建前自动执行，测试与提交前检查产物是否与源文件一致。`shared/pollo-tracking-policy.ts` 仅负责按阶段装配，不再维护独立的规则摘录。Worker 没有本地文件系统，因此运行时使用这个由 Skill 源文件生成的包。

1. 按需求所属端完整分页读取事件、参数、公共属性和枚举四张表，不带 UI 视图过滤，不截取前24个事件或前30条参数。任一表读取失败、字段结构不符或分页不完整时停止生成。
2. 模型先对照完整正式事件目录给出主板块、复用/新增决策和具体理由。新增必须列出比较过的正式事件；已有事件保持原ID。目录明确标记是否可复用，服务端拒绝废弃/待治理事件、伪造引用和已知重复别名。规划校验失败时反馈原因，自动修正一次；仍失败即停止，不放宽校验，不重试模型网络异常。
3. 第二次模型请求携带选中事件的完整正式参数、现有公共属性、相关枚举及状态。模型只输出参数增量，服务端补齐未修改的正式参数，避免大段重复输出导致截断。
4. 校验正式记录来源、参数类型、必传条件、重复参数和公共属性；保留正式类型和历史大小写。元数据原文受保护；模型差异只进入补充说明并待确认。枚举只追加，参数草稿及指标覆盖进入待确认项。结构通过不代表业务指标已经验收。
5. 草稿保存四表快照指纹、读取数量、主板块、逐事件理由及校验报告。人工应用前重新读取四表；旧版草稿或快照变化必须重新生成，确保写入前完成校验。

Web 使用正式事件 `tbly7VI4kwFz5qwR`、参数 `tblNAMKr5S38iXJQ`、公共属性 `tblb783YDTiBNts0`、枚举 `tbl2KEj2zyg8bOmk`。App 使用 `tblAhScEFQYAJC2g`、`tblEYv9lGZeenbT2`、`tblIdlancSXgX9VX`、`tblQ8Ph3N8GJHeVA`。设计工作台及同需求归档记录仅提供背景，不是正式事件存在的证据。

草稿界面显示复用数量、新增建议、正式库读取数量和通过/待确认状态。当前实现对语义复用使用模型比较及明确别名防护；不声称能机械识别所有同义事件。完整性检查也不能替代人工确认PRD指标及归因窗口。

该接入只生成草稿；人工选择后仍走现有草稿应用与评审流程，不会自动更新正式库。

## 生成连接与错误处理

生产前端使用 `POST /api/tracking/ai/records/:recordId/drafts?stream=2`。Worker 返回 NDJSON：`progress` 实时报告读取需求、PRD、完整正式库、复用规划、参数分批设计、统一校验、保存等阶段；每 10 秒发送 `heartbeat`；最后发送 `result` 或 `error`。前端逐行读取并持续展示进度，错误保留在页面上。旧 `stream=1` 的 JSON 前导空白协议继续兼容已打开的旧页面。

流式 HTTP 200 不能代表生成成功。`stream=2` 必须收到 `{ type: 'result', data: { draft } }` 才算完成；`{ type: 'error', status, message, stage }` 是失败。旧协议继续使用 `generationError` 标记。

读取需求与权限限时 30 秒、PRD 30 秒、完整正式库 60 秒；复用规划及一次必要修正每次 90 秒。阶段二每批 1 个事件，最多并发 2 批，每批 120 秒；全部批次完成后统一执行原有完整校验，任一批失败不保存部分初稿。每批保留完整 PRD、当前批次选中正式事件的全部参数、公共属性及相关枚举；阶段一仍完整读取和比较正式事件库。规划输出上限 5,000 token，参数设计每批 12,000 token。

整个生产流式请求最多 10 分钟，截止时强制结束响应并取消上游，避免仅发送取消信号却永久等待。前端另设 11 分钟连接期限。阶段日志只记录阶段名、结果和耗时，不记录 PRD、模型输出或凭据。

每个事件生成后立即执行正式库治理校验。模型改写正式参数类型、必传规则或条件等确定性校验错误，允许仅修正当前事件一次；修正仍失败则停止，连接或超时错误不自动重试。修正使用完整原始上下文和明确冲突信息，不能放宽正式库规则。全部事件完成后再次执行整体校验，才保存完整初稿。

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

当前 AI 设计规范见 [埋点设计 Skill](../skills/pollo-tracking-design/SKILL.md)；[设计规范 V1](TRACKING_DESIGN_GUIDELINES_V1.md) 保留为历史讨论材料。

## 大草稿存储

PolloCloud 数据库单字段上限为 64 KB。草稿超过 60,000 字节时，先用服务端密钥加密并存入应用文件存储，数据库仅保留指针；读取仍先按用户与需求校验数据库记录，再解密文件。旧版内联 JSON 草稿可继续读取。应用文件存储中不保存草稿明文，文件保存失败时不写入指针，页面保留错误提示供排查。
