# AI 埋点设计 MVP

## 妙搭静态配置

测试版在妙搭「静态配置」中逐项新增以下 key。API Key 使用右侧锁图标保存为 Secret，配置完成后重启服务。

| key | 测试值 | 说明 |
|---|---|---|
| `AI_PROVIDER` | `kimi` | 当前模型供应商 |
| `KIMI_API_KEY` | 轮换后的 Kimi Key | 仅存 Secret；不要提交到 Git |
| `AI_BASE_URL` | `https://api.moonshot.cn/v1` | 国内 Kimi 控制台使用该地址 |
| `AI_MODEL` | `kimi-k3` | 已通过当前 Kimi Key 的模型列表与请求接口验证 |
| `AI_REASONING_EFFORT` | `medium` | 埋点初稿使用中等推理强度；兼顾设计质量和生成耗时 |
| `FEISHU_OAUTH_REDIRECT_URI` | `https://bcn0tgplxp2e.feishuapp.com/app/app_17apvbcusvs/api/tracking/ai/feishu-auth/callback` | 必须与飞书开放平台安全设置完全一致 |
| `FEISHU_OAUTH_SCOPES` | `offline_access auth:user.id:read docx:document:readonly wiki:node:read` | 用户文档授权范围；服务端会强制补齐这组最小权限，避免环境配置漂移 |
| `FEISHU_TOKEN_ENCRYPTION_KEY` | 独立生成的 32 字节以上随机值 | 仅存 Secret；用于加密 Base 中的 OAuth Token |

现有 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 继续复用，不要重复创建应用。

Kimi 3 请求固定使用 `temperature=0.6` 并关闭深度思考，减少同步生成超过妙搭网关时限的风险。修改妙搭静态配置后必须重启服务才能生效。

切换公司 OpenAI 配置时：

| key | 正式值 |
|---|---|
| `AI_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | 公司 Secret |
| `AI_BASE_URL` | `https://api.openai.com/v1` |
| `AI_MODEL` | `gpt-5.6-terra` |
| `AI_REASONING_EFFORT` | `medium` |

## 飞书应用配置

1. 在当前自建应用的「安全设置」添加与 `FEISHU_OAUTH_REDIRECT_URI` 完全一致的重定向 URL。
2. 在权限管理中申请并发布 `docx:document:readonly`、`wiki:node:read`、`auth:user.id:read` 和 `offline_access`。服务端调用的是 `docx/v1`，旧的 `docs:document.content:read` 不能替代新版文档只读权限。
3. 发布新的飞书应用版本，并确保数据分析师在应用可用范围内。
4. 回到妙搭重启服务，再在需求详情的埋点设计阶段授权。

权限新增或变化后，历史 `user_access_token` 不会自动获得新权限。系统会将缺少必需 scope 的旧 Token 标记为“需要重新授权”，分析师必须重新完成一次授权。

## MVP 安全边界

- 模型 Key 只在服务端读取，前端接口只返回“是否已配置”。
- PRD 使用分析师自己的 `user_access_token` 读取，权限范围与该用户在飞书中的文档权限一致。
- AI 只生成服务端草稿；分析师确认后才通过现有 TrackingService 写入 Base。
- 草稿应用幂等；已应用草稿再次提交不会重复写入。
- 重新生成创建新版本，不覆盖旧草稿。
- OAuth Token 使用 AES-256-GCM 加密后存入 App Base 的系统模板记录，Base 中不保存用户 ID 或明文 Token；加密密钥只存在妙搭 Secret。
- OAuth 回调通过签名 HttpOnly Cookie 绑定分析师飞书身份；生成与写入接口不信任前端传入的用户 ID。
- 更换 `FEISHU_TOKEN_ENCRYPTION_KEY` 后，已有授权密文将失效，分析师需要重新授权。
- AI 草稿当前使用服务进程内存，服务重启后需要重新生成；正式推广前应迁移到专用草稿表。

## 第一版埋点设计约束

完整规范与待数据负责人校验项见 [埋点设计规范 V1](TRACKING_DESIGN_GUIDELINES_V1.md)。

- 事件按曝光、点击、提交、结果等单一动作拆分。
- `evt_id` 与参数名使用小写 `snake_case`。
- 触发时机必须说明主体、动作、成功/失败边界和去重要求。
- 每个事件必须对应指标、漏斗步骤、路径或质量诊断用途。
- 参数必须包含类型、定义、必传规则、条件、枚举/范围、示例和适用端。
- PRD 未提供的信息统一标记为「待人工确认」，禁止补造版本、枚举或业务规则。
- 正式事件仅可从系统提供的候选中复用，并展示复用来源及修改内容。
