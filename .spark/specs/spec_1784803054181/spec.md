# 技术方案

## 开发元信息
- 开发模式: 全栈应用
- 涉及层级: [插件, 服务端, 前端]
- 数据源: 飞书多维表格（Base），不建本地业务表
- 插件: feishu-bitable（服务端调用，凭证不出服务端）

## 页面路由与导航

### 页面路由
| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 埋点工作台 | 首页，阶段统计 + 我的待办 + 需求列表 |
| `/tracking/:recordId` | 需求详情页 | 埋点需求全流程查看与角色化编辑 |
| `/query-library` | 正式查询库 | 只读搜索正式事件与参数 |

### 导航设计
- 导航机制：页面路由
- 导航项：
  - 埋点工作台
  - 正式查询库

## 业务组件

| 组件 | 来源 | 关联页面 | 对应功能点 |
|------|------|---------|-----------|
| Table | shadcn/ui | 埋点工作台、需求详情页、正式查询库 | 需求列表、参数设计器表格、正式事件列表 |
| Badge | shadcn/ui | 全部页面 | 阶段/状态/优先级标签展示 |
| Button | shadcn/ui | 全部页面 | 操作按钮 |
| Input | shadcn/ui | 埋点工作台、正式查询库 | 搜索框、表单输入 |
| Select | shadcn/ui | 埋点工作台、需求详情页 | 筛选器、表单下拉选择 |
| Dialog | shadcn/ui | 需求详情页 | 参数新增/编辑弹窗 |
| Tabs | shadcn/ui | 需求详情页 | 阶段分区编辑 |
| Tooltip | shadcn/ui | 全部页面 | 信息提示 |
| UserDisplay | business-ui | 埋点工作台、需求详情页 | 负责人展示 |
| UserSelect | business-ui | 需求详情页 | 负责人选择 |
| toast (sonner) | 内置 | 全部页面 | 操作成功/失败提示 |

## 插件设计

| 插件名称 | 基础插件 | 用途 | 调用方式 | 关联页面 | 输入参数 | 输出类型 |
|---------|---------|------|---------|---------|---------|---------|
| bitable-workbench | feishu-bitable | 读写「01 埋点设计工作台」主表 | 服务端 CapabilityService | 埋点工作台、需求详情页 | appToken、tableID | records/total/hasMore |
| bitable-param-detail | feishu-bitable | 读写「后台-设计参数明细」表 | 服务端 CapabilityService | 需求详情页 | appToken、tableID | records/total/hasMore |
| bitable-quality-gate | feishu-bitable | 读取「后台-发布质量门禁」表 | 服务端 CapabilityService | 需求详情页 | appToken、tableID | records |
| bitable-lifecycle | feishu-bitable | 读取「后台-埋点生命周期」表 | 服务端 CapabilityService | 需求详情页 | appToken、tableID | records |
| bitable-query-library | feishu-bitable | 只读「02 App埋点查询库（正式）」表 | 服务端 CapabilityService | 正式查询库 | appToken、tableID | records/total/hasMore |

> 配置说明：5 个插件实例共享同一个 Base appToken（Kgy0b4bvmaJSK8sjQDscUrNJnOf），分别对应 5 张不同的 tableID。所有插件均在服务端调用，前端不直接接触 Base 凭证。

## 业务模型

### 领域模型定义

#### 流程阶段映射
Base 真实枚举 → UI 业务节点映射关系：

| Base 真实枚举 | UI 业务节点 | 节点序号 |
|--------------|------------|---------|
| 需求录入 | 埋点提需 | 1 |
| 埋点设计 | 埋点设计 | 2 |
| 评审通过 | （埋点设计子状态） | - |
| 埋点开发 | 埋点开发 | 3 |
| 数据验收 | 埋点校验 | 4 |
| 上线监控 | 埋点上线 | 5 |
| 稳定归档 | 归档 | 6 |
| 已废弃 | （归档子状态） | - |

#### 角色权限矩阵

| 角色 | 可编辑阶段/字段 |
|------|----------------|
| DS（数据负责人） | 需求录入、埋点设计、参数明细、评审、数据验收、上线监控、归档 |
| 研发负责人 | 埋点开发（开发状态、开发备注、研发侧字段） |
| 无匹配负责人 | 全部只读 |

#### 参数明细字段清单
参数 key、evt_id、参数名、参数类型、是否必传、触发条件、枚举范围、定义、默认值、示例、适用端、状态、版本、变更类型

---

### API 设计

#### 通用约定
- 所有 Base 读写经服务端中转，前端仅调用 `/api/...` 接口
- 列表接口统一游标分页：`{ items, nextCursor, hasMore, total }`
- 错误响应：`{ code, message, details? }`，HTTP 状态码对应 NestJS 异常类型
- 写操作加 `@NeedLogin()`

#### 埋点工作台相关

**页面路径**: `/`

**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 阶段统计卡片 | API → Base aggregateQuery | 按流程阶段分组计数 |
| 我的待办列表 | API → Base searchRecords | 过滤当前用户为负责人的待办 |
| 需求列表搜索筛选 | API → Base searchRecords | 支持关键词+多维度筛选 |
| 当前用户信息 | 平台能力 | req.userContext / useCurrentUserProfile |

**所需 API**:

```typescript
// 获取阶段统计 [领域模型: TrackingRecord] [对应页面功能: 阶段统计区]
GET /api/tracking/stats
Response: {
  items: Array<{ stage: string; count: number }>;
}

// 获取我的待办列表 [领域模型: TrackingRecord] [对应页面功能: 我的待办区]
GET /api/tracking/my-todos?limit=10
Response: {
  items: Array<{
    recordId: string;
    evtId: string;
    eventName: string;
    stage: string;
    priority: string;
    platform: string;
  }>;
}

// 搜索需求列表（支持筛选） [领域模型: TrackingRecord] [对应页面功能: 需求列表区]
GET /api/tracking/records?keyword=&stage=&priority=&platform=&owner=&pageSize=20&pageToken=
Response: {
  items: Array<{
    recordId: string;
    evtId: string;
    eventName: string;
    stage: string;
    priority: string;
    platform: string;
    dataOwner: string[];
    devOwner: string[];
    updatedAt: number;
  }>;
  hasMore: boolean;
  pageToken?: string;
  total: number;
}
```

#### 需求详情页相关

**页面路径**: `/tracking/:recordId`

**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 获取需求详情 | API → Base getRecord | 主表单条记录 |
| 获取参数列表 | API → Base searchRecords | 按 evt_id 关联参数明细表 |
| 更新主表字段 | API → Base batchUpdateRecords | 服务端校验权限与阶段合法性 |
| 新增参数 | API → Base batchAddRecords | 参数明细表新增记录 |
| 编辑参数 | API → Base batchUpdateRecords | 更新参数明细字段 |
| 软删除参数 | API → Base batchUpdateRecords | 状态改为"废弃"，不删除记录 |
| 阶段推进校验 | 服务端逻辑 | 校验阶段跳转合法性、用户权限 |
| 角色权限判断 | 服务端逻辑 | 基于当前用户与负责人字段匹配 |

**所需 API**:

```typescript
// 获取需求详情（含权限信息） [领域模型: TrackingRecord] [对应页面功能: 顶部信息栏+流程条]
GET /api/tracking/records/:recordId
Response: {
  recordId: string;
  evtId: string;
  eventName: string;
  stage: string;          // Base 真实枚举值
  reviewStatus: string;
  devStatus: string;
  acceptanceStatus: string;
  dataOwner: string[];    // suda user id 数组
  devOwner: string[];
  dsAcceptor: string[];
  priority: string;
  platform: string;
  // 各阶段字段（按需返回，字段名与 Base 表对应）
  requirementFields: Record<string, any>;
  designFields: Record<string, any>;
  reviewFields: Record<string, any>;
  devFields: Record<string, any>;
  acceptanceFields: Record<string, any>;
  launchFields: Record<string, any>;
  archiveFields: Record<string, any>;
  // 当前用户权限
  permissions: {
    canEditRequirement: boolean;
    canEditDesign: boolean;
    canEditReview: boolean;
    canEditDev: boolean;
    canEditAcceptance: boolean;
    canEditLaunch: boolean;
    canEditArchive: boolean;
    canEditParams: boolean;
  };
  updatedAt: number;
}

// 更新需求主表字段 [领域模型: TrackingRecord] [对应页面功能: 各阶段编辑保存]
PATCH /api/tracking/records/:recordId
Request: {
  fields: Record<string, any>;  // 待更新的字段键值对（写入格式）
  targetStage?: string;         // 可选：目标阶段，服务端校验跳转合法性
}
Response: {
  success: boolean;
  recordId: string;
  currentStage: string;
}

// 获取参数列表 [领域模型: ParamDetail] [对应页面功能: 参数设计器]
GET /api/tracking/records/:recordId/params
Response: {
  items: Array<{
    recordId: string;
    paramKey: string;
    evtId: string;
    paramName: string;
    paramType: string;
    required: boolean;
    triggerCondition: string;
    enumRange: string;
    definition: string;
    defaultValue: string;
    example: string;
    platform: string;
    status: string;
    version: string;
    changeType: string;
  }>;
  total: number;
}

// 新增参数 [领域模型: ParamDetail] [对应页面功能: 参数设计器-新增]
POST /api/tracking/records/:recordId/params
Request: {
  paramKey: string;
  evtId: string;
  paramName: string;
  paramType: string;
  required: boolean;
  triggerCondition?: string;
  enumRange?: string;
  definition?: string;
  defaultValue?: string;
  example?: string;
  platform?: string;
  status: string;
  version?: string;
  changeType?: string;
}
Response: {
  success: boolean;
  recordId: string;
}

// 编辑参数 [领域模型: ParamDetail] [对应页面功能: 参数设计器-编辑]
PUT /api/tracking/params/:paramRecordId
Request: {
  fields: Record<string, any>;
}
Response: {
  success: boolean;
  recordId: string;
}

// 软删除参数（状态改为废弃） [领域模型: ParamDetail] [对应页面功能: 参数设计器-软删除]
DELETE /api/tracking/params/:paramRecordId
Response: {
  success: boolean;
}
```

#### 正式查询库相关

**页面路径**: `/query-library`

**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 搜索正式事件 | API → Base searchRecords | 只读，支持 evt_id/事件名搜索 |
| 查看事件参数 | API → Base searchRecords | 按事件关联参数，全部只读 |

**所需 API**:

```typescript
// 搜索正式事件 [领域模型: OfficialEvent] [对应页面功能: 事件列表搜索]
GET /api/query-library/events?keyword=&pageSize=20&pageToken=
Response: {
  items: Array<{
    recordId: string;
    evtId: string;
    eventName: string;
    platform: string;
    version: string;
    status: string;
  }>;
  hasMore: boolean;
  pageToken?: string;
  total: number;
}

// 获取事件参数明细 [领域模型: OfficialParam] [对应页面功能: 参数详情展示]
GET /api/query-library/events/:recordId/params
Response: {
  items: Array<{
    paramKey: string;
    paramName: string;
    paramType: string;
    required: boolean;
    definition: string;
    example: string;
  }>;
  total: number;
}
```

### 服务端模块划分

| 模块 | 职责 | 对应表 |
|------|------|--------|
| tracking | 埋点需求主表 CRUD、阶段校验、权限判断、参数管理 | 01 埋点设计工作台 + 后台-设计参数明细 |
| query-library | 正式查询库只读搜索 | 02 App埋点查询库（正式） |
| bitable | 共享 Base 服务层：封装 CapabilityService 调用、统一错误处理、字段映射 | （共享层） |

### 服务端关键逻辑说明

1. **阶段合法性校验**：维护阶段顺序数组，校验目标阶段是否在合法跳转范围内（允许向前推进，不允许跳回已完成阶段）
2. **权限判断**：从 `req.userContext.userId` 获取当前用户 ID，与主表中 `dataOwner`/`devOwner`/`dsAcceptor` 字段的 suda user id 数组比对，返回各阶段可编辑权限
3. **Base 字段映射**：服务层统一管理 Base 字段名 → 业务字段名的双向映射，避免字段名硬编码散落在各处
4. **参数软删除**：DELETE 接口实际执行 batchUpdateRecords，将 `状态` 字段更新为"废弃"
5. **参数保存后更新阶段**：参数新增/编辑成功后，如需推进阶段，由前端显式调用 PATCH 主表接口，服务端校验后更新
6. **错误处理**：Base 调用失败时捕获异常，转换为清晰的业务错误信息（权限不足、记录不存在、参数非法等）
