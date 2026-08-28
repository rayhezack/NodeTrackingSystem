// 阶段配置：UI 节点与 Base 枚举映射、侧边栏导航、表单字段定义

export interface StageFieldConfig {
  key: string;
  label: string;
  type: 'input' | 'textarea' | 'select' | 'date' | 'url' | 'user' | 'attachment';
  baseField: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
  multiple?: boolean;
  required?: boolean;
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
];

// 平台选项
export const PLATFORM_OPTIONS = [
  { value: 'iOS', label: 'iOS' },
  { value: 'Android', label: 'Android' },
  { value: 'iOS、Android', label: 'iOS、Android' },
  { value: 'Web', label: 'Web' },
];

// 评审状态选项
export const REVIEW_STATUS_OPTIONS = [
  { value: '草稿', label: '草稿' },
  { value: '评审中', label: '评审中' },
  { value: '已通过', label: '已通过' },
  { value: '已拒绝', label: '已拒绝' },
];

// 开发状态选项
export const DEV_STATUS_OPTIONS = [
  { value: '未开始', label: '未开始' },
  { value: '开发中', label: '开发中' },
  { value: '已开发', label: '已开发' },
  { value: '阻塞', label: '阻塞' },
];

// 验收状态选项
export const ACCEPTANCE_STATUS_OPTIONS = [
  { value: '未开始', label: '未开始' },
  { value: '验收中', label: '验收中' },
  { value: '通过', label: '通过' },
  { value: '不通过', label: '不通过' },
  { value: '豁免', label: '豁免' },
];

export const HANDLER_OPTIONS = [
  { value: '客户端', label: '客户端' },
  { value: '前端', label: '前端' },
  { value: '服务端', label: '服务端' },
  { value: '数仓', label: '数仓' },
  { value: '多端协同', label: '多端协同' },
];

export const CHANGE_TYPE_OPTIONS = [
  { value: '新增', label: '新增' },
  { value: '修改', label: '修改' },
  { value: '废弃', label: '废弃' },
  { value: '口径调整', label: '口径调整' },
  { value: '仅校验', label: '仅校验（不修改正式库）' },
];

export const QUALITY_GATE_OPTIONS = [
  { value: '未检查', label: '未检查' },
  { value: '已通过', label: '已通过' },
  { value: '阻塞', label: '阻塞' },
  { value: '豁免', label: '豁免' },
];

export const MONITOR_STATUS_OPTIONS = [
  { value: '未开始', label: '未开始' },
  { value: '通过', label: '通过' },
  { value: '不通过', label: '不通过' },
];

export const PUBLISH_STATUS_OPTIONS = [
  { value: '未发布', label: '未发布' },
  { value: '发布中', label: '发布中' },
  { value: '发布成功', label: '发布成功' },
  { value: '发布失败', label: '发布失败' },
];

export const OFFICIAL_STATUS_OPTIONS = [
  { value: '待开发', label: '待开发' },
  { value: '待验收', label: '待验收' },
  { value: '已验收', label: '已验收' },
  { value: '已上线', label: '已上线' },
  { value: '已废弃', label: '已废弃' },
  { value: '待治理', label: '待治理' },
];

// 7 个 UI 流程节点（用于顶部流程条）
export const UI_STAGE_NODES = [
  { key: '埋点提需', label: '埋点提需' },
  { key: '埋点设计', label: '埋点设计' },
  { key: '埋点评审', label: '埋点评审' },
  { key: '埋点开发', label: '埋点开发' },
  { key: '埋点验收', label: '埋点验收' },
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
      { key: 'requestName', label: '需求名称', type: 'input', baseField: '需求名称', placeholder: '如：App 快捷入口与 Launch 数据补齐' },
      { key: 'priority', label: '优先级', type: 'select', baseField: '优先级', options: PRIORITY_OPTIONS },
      { key: 'platform', label: '端', type: 'select', baseField: '端', options: PLATFORM_OPTIONS },
      { key: 'requesterIds', label: '需求提出人 / 提需人', type: 'user', baseField: '需求提出人', multiple: true },
      { key: 'dataOwnerIds', label: '数据负责人', type: 'user', baseField: '数据负责人', multiple: true },
      { key: 'devOwnerIds', label: '研发负责人', type: 'user', baseField: '研发负责人', multiple: true },
      { key: 'dsAcceptorIds', label: '埋点校验人', type: 'user', baseField: 'DS验收人', multiple: true },
      { key: 'expectedCompletionDate', label: '期望完成日期', type: 'date', baseField: '期望完成日期' },
      { key: 'requirementLink', label: 'PRD 文档链接', type: 'url', baseField: '需求链接', placeholder: '请粘贴飞书 PRD 文档链接（wiki 或 docx）', required: true },
      { key: 'requirementBackground', label: '需求背景', type: 'textarea', baseField: '需求背景', placeholder: '说明为什么需要这个埋点...' },
      { key: 'metricScenario', label: '指标/使用场景', type: 'textarea', baseField: '指标/使用场景', placeholder: '说明要支撑的指标、看板或分析场景...' },
    ],
  },
  {
    id: 'design',
    label: '埋点设计',
    uiNode: '埋点设计',
    baseStages: ['埋点设计'],
    permissionKey: 'canEditDesign',
    fields: [
      { key: 'evtId', label: '埋点事件ID / evt_id', type: 'input', baseField: 'evt_id', placeholder: '如：video_play_click' },
      { key: 'eventName', label: '事件名', type: 'input', baseField: '事件中文名', placeholder: '如：视频播放按钮点击' },
      { key: 'priority', label: '优先级', type: 'select', baseField: '优先级', options: PRIORITY_OPTIONS },
      { key: 'platform', label: '端', type: 'select', baseField: '端', options: PLATFORM_OPTIONS },
      { key: 'eventDefinition', label: '事件定义', type: 'textarea', baseField: '事件定义', placeholder: '定义事件统计口径和边界...' },
      { key: 'triggerTiming', label: '触发时机', type: 'textarea', baseField: '触发时机', placeholder: '描述事件触发的具体时机...' },
      { key: 'uiImages', label: 'UI图', type: 'attachment', baseField: 'UI图', placeholder: '上传该埋点事件对应的 UI 截图、原型图或交互位置图' },
      { key: 'handler', label: '处理方', type: 'select', baseField: '处理方', options: HANDLER_OPTIONS },
      { key: 'commonProps', label: '公共属性要求', type: 'textarea', baseField: '公共属性要求', placeholder: '列出必须携带的公共属性...' },
      { key: 'version', label: '版本', type: 'input', baseField: '版本', placeholder: '例如 1.0.0' },
      { key: 'minVersion', label: '最低版本', type: 'input', baseField: '最低版本', placeholder: '例如 1.0.0' },
      { key: 'changeType', label: '变更类型', type: 'select', baseField: '变更类型', options: CHANGE_TYPE_OPTIONS },
    ],
  },
  {
    id: 'review',
    label: '评审',
    uiNode: '埋点评审',
    baseStages: [],
    permissionKey: 'canEditReview',
    fields: [
      { key: 'reviewStatus', label: '评审状态', type: 'select', baseField: '评审状态', options: REVIEW_STATUS_OPTIONS },
      { key: 'reviewComment', label: '评审意见', type: 'textarea', baseField: '评审意见', placeholder: '评审意见与建议...' },
    ],
  },
  {
    id: 'dev',
    label: '埋点开发',
    uiNode: '埋点开发',
    baseStages: ['评审通过', '埋点开发'],
    permissionKey: 'canEditDev',
    fields: [
      { key: 'devStatus', label: '开发状态', type: 'select', baseField: '埋点开发状态', options: DEV_STATUS_OPTIONS },
    ],
  },
  {
    id: 'acceptance',
    label: '埋点验收',
    uiNode: '埋点验收',
    baseStages: ['数据验收'],
    permissionKey: 'canEditAcceptance',
    fields: [
      { key: 'acceptanceStatus', label: '验收状态', type: 'select', baseField: 'DS验收状态', options: ACCEPTANCE_STATUS_OPTIONS },
      { key: 'acceptanceEvidence', label: '验收证据', type: 'textarea', baseField: 'DS验收证据', placeholder: '填写验收口径、查询结果、截图说明或日志摘要' },
      { key: 'acceptanceTime', label: '验收时间', type: 'date', baseField: 'DS验收时间' },
    ],
  },
  {
    id: 'launch',
    label: '上线监控',
    uiNode: '埋点上线',
    baseStages: ['上线监控'],
    permissionKey: 'canEditLaunch',
    fields: [
      { key: 'monitorStatus', label: '上线监控状态', type: 'select', baseField: '上线监控状态', options: MONITOR_STATUS_OPTIONS },
    ],
  },
  {
    id: 'archive',
    label: '归档',
    uiNode: '归档',
    baseStages: ['稳定归档', '已废弃'],
    permissionKey: 'canEditArchive',
    fields: [
      { key: 'officialStatus', label: '正式状态', type: 'select', baseField: '正式状态', options: OFFICIAL_STATUS_OPTIONS },
      { key: 'archiveTime', label: '稳定归档时间', type: 'date', baseField: '稳定归档时间' },
    ],
  },
];

// Base 阶段 → UI 节点映射
export const STAGE_UI_MAP: Record<string, string> = {
  '需求录入': '埋点提需',
  '埋点设计': '埋点设计',
  '评审通过': '埋点开发',
  '埋点开发': '埋点开发',
  '数据验收': '埋点验收',
  '上线监控': '埋点上线',
  '稳定归档': '归档',
  '已废弃': '归档',
};

// 获取当前 UI 节点
export function getCurrentUiNode(
  baseStage: string,
  reviewStatus = '',
  officialStatus = '',
): string {
  if (
    baseStage === '埋点设计' &&
    reviewStatus &&
    reviewStatus !== '草稿'
  ) {
    return '埋点评审';
  }
  if (
    ['稳定归档', '已废弃'].includes(baseStage) &&
    ['已上线', '已废弃'].includes(officialStatus)
  ) {
    return '归档';
  }
  return STAGE_UI_MAP[baseStage] || baseStage;
}

// UI 节点顺序索引
const UI_NODE_ORDER = [
  '埋点提需',
  '埋点设计',
  '埋点评审',
  '埋点开发',
  '埋点验收',
  '埋点上线',
  '归档',
];

export function getUiNodeIndex(uiNode: string): number {
  return UI_NODE_ORDER.indexOf(uiNode === '埋点校验' ? '埋点验收' : uiNode);
}

// 判断 UI 节点是否已完成
export function isUiNodeCompleted(
  baseStage: string,
  uiNode: string,
  reviewStatus = '',
  officialStatus = '',
): boolean {
  if (
    uiNode === '归档' &&
    ['稳定归档', '已废弃'].includes(baseStage) &&
    ['已上线', '已废弃'].includes(officialStatus)
  ) {
    return true;
  }
  const currentUi = getCurrentUiNode(baseStage, reviewStatus, officialStatus);
  const currentIdx = getUiNodeIndex(currentUi);
  const nodeIdx = getUiNodeIndex(uiNode);
  return nodeIdx < currentIdx;
}

// 判断 UI 节点是否为当前激活
export function isUiNodeActive(
  baseStage: string,
  uiNode: string,
  reviewStatus = '',
  officialStatus = '',
): boolean {
  return (
    !isUiNodeCompleted(baseStage, uiNode, reviewStatus, officialStatus) &&
    getCurrentUiNode(baseStage, reviewStatus, officialStatus) === (uiNode === '埋点校验' ? '埋点验收' : uiNode)
  );
}
