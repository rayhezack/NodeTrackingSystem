// 飞书多维表格插件实例 ID 常量
export const APP_BITABLE_APP_TOKEN = 'Kgy0b4bvmaJSK8sjQDscUrNJnOf';
export const WEB_BITABLE_APP_TOKEN = 'EX4RbTvp9agYNws6PIHcKD20nqf';

export const BITABLE_INSTANCES = {
  workbench: 'feishu_bitable_01_buried_point_design_workbench_1',
  paramDetail: 'feishu_bitable_design_parameter_detail_1',
  qualityGate: 'feishu_bitable_background_publish_quality_access_control_read_1',
  lifecycle: 'feishu_bitable_buried_point_lifecycle_read_1',
  queryLibrary: 'feishu_bitable_app_buried_point_readonly_1',
  webWorkbench: 'feishu_bitable_web_tracking_design_workbench_1',
  webParamDetail: 'feishu_bitable_web_design_parameter_detail_1',
  webQueryLibrary: 'feishu_bitable_web_tracking_query_library_1',
} as const;

export type BitableInstanceKey = keyof typeof BITABLE_INSTANCES;

export const BITABLE_APP_TOKENS: Record<BitableInstanceKey, string> = {
  workbench: APP_BITABLE_APP_TOKEN,
  paramDetail: APP_BITABLE_APP_TOKEN,
  qualityGate: APP_BITABLE_APP_TOKEN,
  lifecycle: APP_BITABLE_APP_TOKEN,
  queryLibrary: APP_BITABLE_APP_TOKEN,
  webWorkbench: WEB_BITABLE_APP_TOKEN,
  webParamDetail: WEB_BITABLE_APP_TOKEN,
  webQueryLibrary: WEB_BITABLE_APP_TOKEN,
};

// 表 ID 映射
export const BITABLE_TABLE_IDS: Record<BitableInstanceKey, string> = {
  workbench: 'tblqHhr5aZwr4QOZ',
  paramDetail: 'tblesT69TDCUKzhs',
  qualityGate: 'tblUCH6PxC1sQwXx',
  lifecycle: 'tblJ8G3X1001g9oA',
  queryLibrary: 'tblAhScEFQYAJC2g',
  webWorkbench: 'tblsFFvYkTPkabFT',
  webParamDetail: 'tblMaw89yVi68YY6',
  webQueryLibrary: 'tbly7VI4kwFz5qwR',
};

interface BitableFieldConfig {
  id: string;
  name: string;
  type: number;
  bizType: string;
  readable: boolean;
  writeable: boolean;
  enumValues?: string[];
}

export const BITABLE_FIELDS: Record<BitableInstanceKey, BitableFieldConfig[]> = {
  workbench: [
    { id: 'fldevt_id', name: 'evt_id', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldevent_cn_name', name: '事件中文名', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldstage', name: '流程阶段', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldpriority', name: '优先级', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldplatform', name: '端', type: 4, bizType: 'MultiSelect', readable: true, writeable: true },
    { id: 'fldgwGzNsP', name: '需求提出人', type: 11, bizType: 'User', readable: true, writeable: true },
    { id: 'fldOXTa5uB', name: '需求录入人', type: 11, bizType: 'User', readable: true, writeable: true },
    { id: 'flddata_owner', name: '数据负责人', type: 11, bizType: 'User', readable: true, writeable: true },
    { id: 'flddev_owner', name: '研发负责人', type: 11, bizType: 'User', readable: true, writeable: true },
    { id: 'fldds_acceptor', name: 'DS验收人', type: 11, bizType: 'User', readable: true, writeable: true },
    { id: 'fldcreated_time', name: '创建时间', type: 1001, bizType: 'CreatedTime', readable: true, writeable: false },
    { id: 'fldupdated_time', name: '更新时间', type: 1002, bizType: 'ModifiedTime', readable: true, writeable: false },
    { id: 'fldreview_status', name: '评审状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'flddev_status', name: '埋点开发状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldds_accept_status', name: 'DS验收状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldpublish_status', name: '发布状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldgate_status', name: '发布门禁状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldversion', name: '版本', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldmin_version', name: '最低版本', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldcategory1', name: '一级分类', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldrecord_type', name: '记录类型', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldchange_type', name: '变更类型', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldhandler', name: '处理方', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldreq_bg', name: '需求背景', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldevent_def', name: '事件定义', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldtrigger', name: '触发时机', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldmetrics', name: '指标/使用场景', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldpublic_attrs', name: '公共属性要求', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldreq_link', name: '需求链接', type: 15, bizType: 'Url', readable: true, writeable: true },
    { id: 'fldparam_entry', name: '参数明细入口', type: 15, bizType: 'Url', readable: true, writeable: true },
    { id: 'fldparam_split_status', name: '参数拆行状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldparam_link', name: '关联参数明细（系统）', type: 18, bizType: 'DuplexLink', readable: true, writeable: false },
    { id: 'fldlifecycle_link', name: '生命周期记录', type: 18, bizType: 'DuplexLink', readable: true, writeable: false },
    { id: 'fldquality_gate', name: '发布质量门禁', type: 18, bizType: 'DuplexLink', readable: true, writeable: false },
    { id: 'fldreview_comment', name: '评审意见', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldgate_fail_reason', name: '发布门禁失败原因', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldmetric_mapping', name: '指标映射', type: 18, bizType: 'DuplexLink', readable: true, writeable: false },
    { id: 'fldformal_status', name: '正式状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldonline_monitor_status', name: '上线监控状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
  ],
  paramDetail: [
    { id: 'fldZ5kcKld', name: '设计参数主键', type: 20, bizType: 'Formula', readable: true, writeable: false },
    { id: 'fldevt_id', name: 'evt_id', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldparam_name', name: '参数名', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldparam_type', name: '数据类型', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldparam_def', name: '参数定义', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldis_required', name: '必传规则', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldvalue_range', name: '枚举/取值范围', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'flddefault_value', name: '默认值/示例', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldparam_status', name: '参数状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldversion', name: '版本', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldchange_type', name: '变更类型', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldplatform', name: 'App适用性', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldreview_status', name: '评审状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldpublish_status', name: '发布状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldcondition_desc', name: '条件说明', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldcreated_time', name: '创建时间', type: 1001, bizType: 'CreatedTime', readable: true, writeable: false },
    { id: 'fldupdated_time', name: '更新时间', type: 1002, bizType: 'ModifiedTime', readable: true, writeable: false },
  ],
  qualityGate: [
    { id: 'fldevt_id', name: 'evt_id', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldgate_item', name: '门禁项', type: 3, bizType: 'SingleSelect', readable: true, writeable: false },
    { id: 'fldgate_result', name: '门禁结果', type: 3, bizType: 'SingleSelect', readable: true, writeable: false },
    { id: 'fldgate_detail', name: '门禁详情', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldcheck_time', name: '检查时间', type: 5, bizType: 'DateTime', readable: true, writeable: false },
  ],
  lifecycle: [
    { id: 'fldevt_id', name: 'evt_id', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldstage', name: '阶段', type: 3, bizType: 'SingleSelect', readable: true, writeable: false },
    { id: 'fldoperator', name: '操作人', type: 11, bizType: 'User', readable: true, writeable: false },
    { id: 'fldoperate_time', name: '操作时间', type: 5, bizType: 'DateTime', readable: true, writeable: false },
    { id: 'fldoperate_desc', name: '操作说明', type: 1, bizType: 'Text', readable: true, writeable: false },
  ],
  queryLibrary: [
    { id: 'fldiip9LOb', name: 'evt_id', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldj5CLc45', name: '事件中文名', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldTSdbmKN', name: '端', type: 4, bizType: 'MultiSelect', readable: true, writeable: false },
    { id: 'flddrBritu', name: '上线版本', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldg957pyK', name: '状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: false },
    { id: 'fldCDvXn26', name: '生命周期状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: false },
    { id: 'fldrVQ43vR', name: '参数明细入口', type: 15, bizType: 'Url', readable: true, writeable: false },
    { id: 'fld3cwv8gv', name: '事件定义', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldxv7oxpP', name: '触发时机', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldqQfTT9q', name: '指标/使用场景', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fld5xpsf0p', name: '关联参数明细（系统）', type: 18, bizType: 'DuplexLink', readable: true, writeable: false },
  ],
  webWorkbench: [
    { id: 'fldevt_id_web', name: 'evt_id', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldevent_cn_name_web', name: '事件中文名', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldstage_web', name: '流程阶段', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldpriority_web', name: '优先级', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldplatform_web', name: '端', type: 4, bizType: 'MultiSelect', readable: true, writeable: true },
    { id: 'fld3VkDsty', name: '需求提出人', type: 11, bizType: 'User', readable: true, writeable: true },
    { id: 'fldmXg85mP', name: '需求录入人', type: 11, bizType: 'User', readable: true, writeable: true },
    { id: 'flddata_owner_web', name: '数据负责人', type: 11, bizType: 'User', readable: true, writeable: true },
    { id: 'flddev_owner_web', name: '研发负责人', type: 11, bizType: 'User', readable: true, writeable: true },
    { id: 'fldds_acceptor_web', name: 'DS验收人', type: 11, bizType: 'User', readable: true, writeable: true },
    { id: 'fldcreated_time_web', name: '创建时间', type: 1001, bizType: 'CreatedTime', readable: true, writeable: false },
    { id: 'fldreview_status_web', name: '评审状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'flddev_status_web', name: '埋点开发状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldds_accept_status_web', name: 'DS验收状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldpublish_status_web', name: '发布状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldgate_status_web', name: '发布门禁状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldversion_web', name: '版本', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldmin_version_web', name: '最低版本', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldrecord_type_web', name: '记录类型', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldchange_type_web', name: '变更类型', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldhandler_web', name: '处理方', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldreq_bg_web', name: '需求背景', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldevent_def_web', name: '事件定义', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldtrigger_web', name: '触发时机', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldmetrics_web', name: '指标/使用场景', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldpublic_attrs_web', name: '公共属性要求', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldreq_link_web', name: '需求链接', type: 15, bizType: 'Url', readable: true, writeable: true },
    { id: 'fldparam_entry_web', name: '参数明细入口', type: 15, bizType: 'Url', readable: true, writeable: true },
    { id: 'fldparam_split_status_web', name: '参数拆行状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldreview_comment_web', name: '评审意见', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldgate_fail_reason_web', name: '发布门禁失败原因', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldformal_status_web', name: '正式状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldonline_monitor_status_web', name: '上线监控状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
  ],
  webParamDetail: [
    { id: 'fldZ5kcKld', name: '设计参数主键', type: 20, bizType: 'Formula', readable: true, writeable: false },
    { id: 'fldevt_id_param_web', name: 'evt_id', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldparam_name_web', name: '参数名', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldparam_type_web', name: '数据类型', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldrequired_web', name: '必传规则', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldcondition_web', name: '条件说明', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldenum_web', name: '枚举/取值范围', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldparam_def_web', name: '参数定义', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'flddefault_web', name: '默认值/示例', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldplatform_param_web', name: 'Web适用性', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldstatus_param_web', name: '参数状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldversion_param_web', name: '版本', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldchange_param_web', name: '变更类型', type: 3, bizType: 'SingleSelect', readable: true, writeable: true },
    { id: 'fldsource_id_param_web', name: '来源设计记录ID', type: 1, bizType: 'Text', readable: true, writeable: true },
    { id: 'fldlink_param_web', name: '关联设计', type: 18, bizType: 'DuplexLink', readable: true, writeable: true },
  ],
  webQueryLibrary: [
    { id: 'fldiip9LOb', name: 'evt_id', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldj5CLc45', name: '事件中文名', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldTSdbmKN', name: '端', type: 4, bizType: 'MultiSelect', readable: true, writeable: false },
    { id: 'flddrBritu', name: '上线版本', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldg957pyK', name: '状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: false },
    { id: 'fldCDvXn26', name: '生命周期状态', type: 3, bizType: 'SingleSelect', readable: true, writeable: false },
    { id: 'fldrVQ43vR', name: '参数明细入口', type: 15, bizType: 'Url', readable: true, writeable: false },
    { id: 'fld3cwv8gv', name: '事件定义', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldxv7oxpP', name: '触发时机', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fldqQfTT9q', name: '指标/使用场景', type: 1, bizType: 'Text', readable: true, writeable: false },
    { id: 'fld5xpsf0p', name: '关联参数明细（系统）', type: 18, bizType: 'DuplexLink', readable: true, writeable: false },
  ],
};

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
