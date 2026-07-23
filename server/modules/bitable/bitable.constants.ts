// 飞书多维表格插件实例 ID 常量
// 所有插件实例共享同一个 Base appToken: Kgy0b4bvmaJSK8sjQDscUrNJnOf

export const BITABLE_INSTANCES = {
  workbench: 'feishu_bitable_01_buried_point_design_workbench_1',
  paramDetail: 'feishu_bitable_design_parameter_detail_1',
  qualityGate: 'feishu_bitable_background_publish_quality_access_control_read_1',
  lifecycle: 'feishu_bitable_buried_point_lifecycle_read_1',
  queryLibrary: 'feishu_bitable_app_buried_point_readonly_1',
} as const;

export type BitableInstanceKey = keyof typeof BITABLE_INSTANCES;

// 表 ID 映射
export const BITABLE_TABLE_IDS = {
  workbench: 'tblqHhr5aZwr4QOZ',
  paramDetail: 'tblesT69TDCUKzhs',
  qualityGate: 'tblUCH6PxC1sQwXx',
  lifecycle: 'tblJ8G3X1001g9oA',
  queryLibrary: 'tblAhScEFQYAJC2g',
} as const;

// Base 真实枚举值 → UI 业务节点映射
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

// UI 业务节点 → Base 真实枚举值（写回时用）
export const STAGE_BASE_MAP: Record<string, string> = {
  '埋点提需': '需求录入',
  '埋点设计': '埋点设计',
  '埋点开发': '埋点开发',
  '埋点校验': '数据验收',
  '埋点上线': '上线监控',
  '归档': '稳定归档',
};

// 流程阶段顺序（用于合法性校验，Base 真实枚举顺序）
export const STAGE_ORDER = [
  '需求录入',
  '埋点设计',
  '评审通过',
  '埋点开发',
  '数据验收',
  '上线监控',
  '稳定归档',
  '已废弃',
];

// 6 个 UI 业务节点顺序
export const UI_STAGE_NODES = [
  '埋点提需',
  '埋点设计',
  '埋点开发',
  '埋点校验',
  '埋点上线',
  '归档',
];

// 优先级排序权重
export const PRIORITY_WEIGHT: Record<string, number> = {
  'P0': 0,
  'P1': 1,
  'P2': 2,
  'P3': 3,
};
