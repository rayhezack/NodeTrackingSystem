// 阶段配置：UI 节点与 Base 枚举映射、侧边栏导航、表单字段定义

export interface StageFieldConfig {
  key: string;
  label: string;
  type: 'input' | 'textarea' | 'select' | 'date' | 'user';
  baseField: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
  multiple?: boolean;
}

export interface StageConfig {
  id: string;
  label: string;
  uiNode: string;
  baseStages: string[];
  permissionKey: keyof import('@shared/api.interface').TrackingDetailPermissions;
  fields: StageFieldConfig[];
}

// 优先级选项
export const PRIORITY_OPTIONS = [
  { value: 'P0', label: 'P0 - 紧急' },
  { value: 'P1', label: 'P1 - 高' },
  { value: 'P2', label: 'P2 - 中' },
  { value: 'P3', label: 'P3 - 低' },
];

// 平台选项
export const PLATFORM_OPTIONS = [
  { value: 'iOS', label: 'iOS' },
  { value: 'Android', label: 'Android' },
  { value: 'iOS、Android', label: 'iOS、Android' },
  { value: 'App通用', label: 'App通用' },
  { value: 'Web', label: 'Web' },
];

// 评审状态选项
export const REVIEW_STATUS_OPTIONS = [
  { value: '草稿', label: '草稿' },
  { value: '评审中', label: '评审中' },
  { value: '已通过', label: '已通过' },
  { value: '需修改', label: '需修改' },
];

// 开发状态选项
export const DEV_STATUS_OPTIONS = [
  { value: '未开始', label: '未开始' },
  { value: '开发中', label: '开发中' },
  { value: '已完成', label: '已完成' },
];

// 验收状态选项
export const ACCEPTANCE_STATUS_OPTIONS = [
  { value: '未开始', label: '未开始' },
  { value: '验收中', label: '验收中' },
  { value: '通过', label: '通过' },
  { value: '不通过', label: '不通过' },
];

// 6 个 UI 流程节点（用于顶部流程条）
export const UI_STAGE_NODES = [
  { key: '埋点提需', label: '埋点提需' },
  { key: '埋点设计', label: '埋点设计' },
  { key: '埋点开发', label: '埋点开发' },
  { key: '埋点校验', label: '埋点校验' },
  { key: '埋点上线', label: '埋点上线' },
  { key: '归档', label: '归档' },
];

// 侧边栏阶段导航（7 个阶段，评审单独列出）
export const SIDEBAR_STAGES: StageConfig[] = [
  {
    id: 'requirement',
    label: '需求录入',
    uiNode: '埋点提需',
    baseStages: ['需求录入'],
    permissionKey: 'canEditRequirement',
    fields: [
      { key: 'eventName', label: '事件名', type: 'input', baseField: '事件中文名' },
      { key: 'evtId', label: 'evt_id', type: 'input', baseField: 'evt_id' },
      { key: 'priority', label: '优先级', type: 'select', baseField: '优先级', options: PRIORITY_OPTIONS },
      { key: 'platform', label: '端', type: 'select', baseField: '端', options: PLATFORM_OPTIONS },
      { key: 'requesterIds', label: '需求提出人 / 提需人', type: 'user', baseField: '需求提出人', multiple: true },
      { key: 'recorderIds', label: '需求录入人', type: 'user', baseField: '需求录入人', multiple: true },
      { key: 'dataOwnerIds', label: '数据负责人', type: 'user', baseField: '数据负责人', multiple: true },
      { key: 'devOwnerIds', label: '研发负责人', type: 'user', baseField: '研发负责人', multiple: true },
      { key: 'dsAcceptorIds', label: 'DS 验收人', type: 'user', baseField: 'DS验收人', multiple: true },
      { key: 'requirementBackground', label: '需求背景', type: 'textarea', baseField: '需求背景', placeholder: '说明为什么需要这个埋点...' },
      { key: 'metricScenario', label: '指标/使用场景', type: 'textarea', baseField: '指标/使用场景', placeholder: '说明要支撑的指标、看板或分析场景...' },
    ],
  },
  {
    id: 'design',
    label: '埋点设计',
    uiNode: '埋点设计',
    baseStages: ['埋点设计', '评审通过'],
    permissionKey: 'canEditDesign',
    fields: [
      { key: 'eventDefinition', label: '事件定义', type: 'textarea', baseField: '事件定义', placeholder: '定义事件统计口径和边界...' },
      { key: 'triggerTiming', label: '触发时机', type: 'textarea', baseField: '触发时机', placeholder: '描述事件触发的具体时机...' },
      { key: 'handler', label: '处理方', type: 'input', baseField: '处理方', placeholder: '客户端/服务端/数仓...' },
      { key: 'commonProps', label: '公共属性要求', type: 'textarea', baseField: '公共属性要求', placeholder: '列出必须携带的公共属性...' },
      { key: 'version', label: '版本', type: 'input', baseField: '版本', placeholder: '例如 1.0.0' },
      { key: 'minVersion', label: '最低版本', type: 'input', baseField: '最低版本', placeholder: '例如 1.0.0' },
      { key: 'changeType', label: '变更类型', type: 'input', baseField: '变更类型', placeholder: '新增/变更/下线' },
    ],
  },
  {
    id: 'review',
    label: '评审',
    uiNode: '埋点设计',
    baseStages: ['评审通过'],
    permissionKey: 'canEditReview',
    fields: [
      { key: 'reviewStatus', label: '评审状态', type: 'select', baseField: '评审状态', options: REVIEW_STATUS_OPTIONS },
      { key: 'reviewComment', label: '评审意见', type: 'textarea', baseField: '评审意见', placeholder: '评审意见与建议...' },
      { key: 'qualityGateStatus', label: '发布门禁状态', type: 'input', baseField: '发布门禁状态', placeholder: '待检查/通过/失败' },
      { key: 'qualityGateReason', label: '门禁失败原因', type: 'textarea', baseField: '发布门禁失败原因', placeholder: '如未通过，请填写失败原因...' },
    ],
  },
  {
    id: 'dev',
    label: '埋点开发',
    uiNode: '埋点开发',
    baseStages: ['埋点开发'],
    permissionKey: 'canEditDev',
    fields: [
      { key: 'devStatus', label: '开发状态', type: 'select', baseField: '埋点开发状态', options: DEV_STATUS_OPTIONS },
    ],
  },
  {
    id: 'acceptance',
    label: '数据验收',
    uiNode: '埋点校验',
    baseStages: ['数据验收'],
    permissionKey: 'canEditAcceptance',
    fields: [
      { key: 'acceptanceStatus', label: '验收状态', type: 'select', baseField: 'DS验收状态', options: ACCEPTANCE_STATUS_OPTIONS },
      { key: 'acceptanceEvidence', label: '验收证据', type: 'textarea', baseField: 'DS验收证据', placeholder: '粘贴验收查询、截图或日志证据...' },
      { key: 'acceptanceTime', label: '验收时间', type: 'input', baseField: 'DS验收时间', placeholder: 'YYYY-MM-DD' },
    ],
  },
  {
    id: 'launch',
    label: '上线监控',
    uiNode: '埋点上线',
    baseStages: ['上线监控'],
    permissionKey: 'canEditLaunch',
    fields: [
      { key: 'monitorStatus', label: '上线监控状态', type: 'input', baseField: '上线监控状态', placeholder: '未开始/观察中/正常/异常' },
      { key: 'monitorConclusion', label: '上线监控结论', type: 'textarea', baseField: '上线监控结论', placeholder: '填写上线后的数据监控结论...' },
      { key: 'publishStatus', label: '发布状态', type: 'input', baseField: '发布状态', placeholder: '未发布/已发布/发布失败' },
      { key: 'publishError', label: '发布错误', type: 'textarea', baseField: '发布错误', placeholder: '如发布失败，请填写错误原因...' },
    ],
  },
  {
    id: 'archive',
    label: '归档',
    uiNode: '归档',
    baseStages: ['稳定归档', '已废弃'],
    permissionKey: 'canEditArchive',
    fields: [
      { key: 'officialStatus', label: '正式状态', type: 'input', baseField: '正式状态', placeholder: '未归档/已归档/已废弃' },
      { key: 'archiveTime', label: '稳定归档时间', type: 'input', baseField: '稳定归档时间', placeholder: 'YYYY-MM-DD' },
    ],
  },
];

// Base 阶段 → UI 节点映射
export const STAGE_UI_MAP: Record<string, string> = {
  '需求录入': '埋点提需',
  '埋点设计': '埋点设计',
  '评审通过': '埋点设计',
  '埋点开发': '埋点开发',
  '数据验收': '埋点校验',
  '上线监控': '埋点上线',
  '稳定归档': '归档',
  '已废弃': '归档',
};

// 获取当前 UI 节点
export function getCurrentUiNode(baseStage: string): string {
  return STAGE_UI_MAP[baseStage] || baseStage;
}

// UI 节点顺序索引
const UI_NODE_ORDER = ['埋点提需', '埋点设计', '埋点开发', '埋点校验', '埋点上线', '归档'];

export function getUiNodeIndex(uiNode: string): number {
  return UI_NODE_ORDER.indexOf(uiNode);
}

// 判断 UI 节点是否已完成
export function isUiNodeCompleted(baseStage: string, uiNode: string): boolean {
  const currentUi = getCurrentUiNode(baseStage);
  const currentIdx = getUiNodeIndex(currentUi);
  const nodeIdx = getUiNodeIndex(uiNode);
  return nodeIdx < currentIdx;
}

// 判断 UI 节点是否为当前激活
export function isUiNodeActive(baseStage: string, uiNode: string): boolean {
  return getCurrentUiNode(baseStage) === uiNode;
}
