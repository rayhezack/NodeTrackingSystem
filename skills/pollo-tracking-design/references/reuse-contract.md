# 复用边界与字段归属

用于所有复用规划、参数生成及失败修正。正式事件和参数是跨需求资产；本次需求说明只属于当前需求。

## 决策表

| 需求变化 | 处理方式 | 不允许的操作 |
|---|---|---|
| 同一语义、触发边界与现有取值 | 直接复用，记录适用场景 | 把通用事件定义改成本项目定义 |
| 同一参数增加合法取值 | 保留全部原值，只追加新枚举 | 用本需求枚举子集替换完整枚举 |
| 原参数不足以表达新增维度 | 增加必要可选参数并解释用途 | 修改旧参数含义或把新参数设为必传 |
| 主体、动作或结果边界改变 | 比较其他事件；无法覆盖则建议新事件并说明理由 | 沿用旧 evt_id 改写触发时机 |
| 只有页面位置、按钮文案、验收细节变化 | 填写本次需求补充说明 | 写入参数定义、示例或默认值 |

## 不可变字段

- 事件：evtId、eventName、eventDefinition、triggerTiming、platform、handler、commonProps、version、minVersion、metricScenario。保持正式原文；正式空值保持空值，资料不完整放入确认项。
- 参数：paramName、paramType、requiredRule、triggerCondition、definition、example、platform。不能润色或追加本项目段落。正式参数未提供独立 defaultValue 时保持空值，不拿 example 推导默认值。
- 枚举：既有值及其既有语义不变，只追加新值。不能通过删值、替换值、重新解释旧值改变统计范围。
- 需求自己的 priority、证据、评审状态及补充说明可以按本需求填写；它们不授权修改正式口径。

若 PRD 与上述正式字段矛盾，明确列出双方原文并标记待确认。`requestNotes` 不是绕过不可变规则的通道。

## 补充说明如何写

事件与参数均使用 `requestNotes`，按适用情况写明：

- 本次需求的页面/组件位置与适用分支。
- 新增取值及其业务含义，或新增参数的取值来源。
- 操作、上报及验收注意事项，明确它们是否符合正式触发边界。
- 版本建议、尚未确认的口径，以及需要谁确认的问题。

事件说明保存到设计工作台“本次需求补充说明”；参数说明保存到设计参数表“本次需求说明”。它们不进入正式定义。`reuseSource.modificationSummary` 总结允许的增量；不是修改正式 metadata 的许可。

## 示例一：新增 Remix 取值

正式参数：`creation_template_click.button_name`，定义“点击位置名称”，已有枚举 `recreate`。需求新增 Pollo Motion 右侧模板卡片的 Remix 按钮。

正确设计：

- 保留正式事件定义和触发时机原文。
- 参数 `definition` 仍为“点击位置名称”，其类型、必传条件、示例和适用端沿用正式值。
- `enumRange` 包含原有 `recreate`，并追加 `remix`。
- 参数 `requestNotes`：本需求新增取值 remix；Pollo Motion 右侧模板瀑布流中悬停模板卡片出现的 Remix 按钮，点击后样片带入左侧参考视频，点击后未提交也记录。需确认该点击符合正式 creation_template_click 的触发边界。
- 不把上述整段写入 definition 或 example；不把 remix 自动设为默认值。

## 示例二：修改创作提交的触发边界

正式 `createflow_form_submit` 定义“提交创作表单”，触发时机“用户点击 Create 时”。若需求要求“仅校验通过且已上传视频与至少一个参考素材时记录”，这是更窄的触发边界。

不得把该条件写入正式 triggerTiming，也不得在补充说明中直接要求研发覆盖正式规则。保留原文，列出口径冲突；确认原事件能否表达该需求，或是否已有其他事件覆盖，再决定设计。

## 示例三：正式参数不完整

正式参数 definition 为空、类型为 STRING。即使根据字段名能推测含义，也保留空定义和 STRING；在 uncertainties 中请数据负责人补全正式定义，不擅自填入本需求定义或改成 INTEGER。
