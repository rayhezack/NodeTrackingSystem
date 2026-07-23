// 阶段配置：UI 节点与 Base 枚举映射、侧边栏导航、表单字段定义

export interface StageFieldConfig {
  key: string;
  label: string;
  type: 'input' | 'textarea' | 'select' | 'date';
  baseField: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
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
  { value: 'Web', label: 'Web' },
  { value: '小程序', label: '小程序' },
  { value: '全端', label: '全端' },
];

// 评审状态选项
export const REVIEW_STATUS_OPTIONS = [
  { value: '待评审', label: '待评审' },
  { value: '评审中', label: '评审中' },
  { value: '评审通过', label: '评审通过' },
  { value: '评审驳回', label: '评审驳回' },
];

// 开发状态选项
export const DEV_STATUS_OPTIONS = [
  { value: '待开发', label: '待开发' },
  { value: '开发中', label: '开发中' },
  { value: '开发完成', label: '开发完成' },
  { value: '已提测', label: '已提测' },
];

// 验收状态选项
export const ACCEPTANCE_STATUS_OPTIONS = [
  { value: '待验收', label: '待验收' },
  { value: '验收中', label: '验收中' },
  { value: '验收通过', label: '验收通过' },
  { value: '验收驳回', label: '验收驳回' },
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
      { key: 'eventName', label: '事件名', type: 'input', baseField: '事件名' },
      { key: 'evtId', label: 'evt_id', type: 'input', baseField: 'evt_id' },
      { key: 'priority', label: '优先级', type: 'select', baseField: '优先级', options: PRIORITY_OPTIONS },
      { key: 'platform', label: '平台', type: 'select', baseField: '平台', options: PLATFORM_OPTIONS },
    ],
  },
  {
    id: 'design',
    label: '埋点设计',
    uiNode: '埋点设计',
    baseStages: ['埋点设计', '评审通过'],
    permissionKey: 'canEditDesign',
    fields: [
      { key: 'triggerTiming', label: '触发时机', type: 'textarea', baseField: '触发时机', placeholder: '描述事件触发的具体时机...' },
      { key: 'trackingDesc', label: '埋点说明', type: 'textarea', baseField: '埋点说明', placeholder: '详细说明埋点用途与统计口径...' },
      { key: 'designRemark', label: '设计备注', type: 'textarea', baseField: '设计备注', placeholder: '设计阶段补充说明...' },
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
      { key: 'reviewTime', label: '评审时间', type: 'input', baseField: '评审时间', placeholder: 'YYYY-MM-DD' },
    ],
  },
  {
    id: 'dev',
    label: '埋点开发',
    uiNode: '埋点开发',
    baseStages: ['埋点开发'],
    permissionKey: 'canEditDev',
    fields: [
      { key: 'devStatus', label: '开发状态', type: 'select', baseField: '开发状态', options: DEV_STATUS_OPTIONS },
      { key: 'devRemark', label: '开发备注', type: 'textarea', baseField: '开发备注', placeholder: '开发过程中的备注信息...' },
      { key: 'expectedFinishTime', label: '预计完成时间', type: 'input', baseField: '预计完成时间', placeholder: 'YYYY-MM-DD' },
    ],
  },
  {
    id: 'acceptance',
    label: '数据验收',
    uiNode: '埋点校验',
    baseStages: ['数据验收'],
    permissionKey: 'canEditAcceptance',
    fields: [
      { key: 'acceptanceStatus', label: '验收状态', type: 'select', baseField: '验收状态', options: ACCEPTANCE_STATUS_OPTIONS },
      { key: 'acceptanceComment', label: '验收意见', type: 'textarea', baseField: '验收意见', placeholder: '验收结论与问题反馈...' },
      { key: 'acceptanceTime', label: '验收时间', type: 'input', baseField: '验收时间', placeholder: 'YYYY-MM-DD' },
    ],
  },
  {
    id: 'launch',
    label: '上线监控',
    uiNode: '埋点上线',
    baseStages: ['上线监控'],
    permissionKey: 'canEditLaunch',
    fields: [
      { key: 'launchVersion', label: '上线版本', type: 'input', baseField: '上线版本', placeholder: 'v1.0.0' },
      { key: 'launchTime', label: '上线时间', type: 'input', baseField: '上线时间', placeholder: 'YYYY-MM-DD' },
      { key: 'monitorStatus', label: '监控状态', type: 'input', baseField: '监控状态', placeholder: '正常/异常/观察中' },
    ],
  },
  {
    id: 'archive',
    label: '归档',
    uiNode: '归档',
    baseStages: ['稳定归档', '已废弃'],
    permissionKey: 'canEditArchive',
    fields: [
      { key: 'archiveStatus', label: '归档状态', type: 'input', baseField: '归档状态', placeholder: '稳定归档/已废弃' },
      { key: 'archiveTime', label: '归档时间', type: 'input', baseField: '归档时间', placeholder: 'YYYY-MM-DD' },
      { key: 'archiveRemark', label: '归档备注', type: 'textarea', baseField: '归档备注', placeholder: '归档说明...' },
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
