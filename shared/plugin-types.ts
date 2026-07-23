// ---- plugin:feishu_bitable_buried_point_lifecycle_read_1 ----
// ============================================================
// 插件 feishu_bitable_buried_point_lifecycle_read_1 (后台-埋点生命周期表只读实例) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface FeishuBitableBuriedPointLifecycleReadOneAggregatequeryInput {
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
    conjunction: string;
  };
  /** [object Object] */
  expandArrayDimension?: boolean;
  /** [object Object] */
  dimensions?: string[];
  /** [object Object] */
  measures?: {
    alias: string;
    fieldName: string;
    aggregation: string;
  }[];
}

/**
 * capabilityClient.load('feishu_bitable_buried_point_lifecycle_read_1').call<FeishuBitableBuriedPointLifecycleReadOneAggregatequeryOutput>('aggregateQuery', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { result, hasMore, pageToken } = result;
 */
export interface FeishuBitableBuriedPointLifecycleReadOneAggregatequeryOutput {
  /** [object Object] */
  result: {

  }[];
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
}

export interface FeishuBitableBuriedPointLifecycleReadOneBatchaddrecordsInput {
  /** [object Object] */
  records: {
    record: {

    };
  }[];
}

/**
 * capabilityClient.load('feishu_bitable_buried_point_lifecycle_read_1').call<FeishuBitableBuriedPointLifecycleReadOneBatchaddrecordsOutput>('batchAddRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface FeishuBitableBuriedPointLifecycleReadOneBatchaddrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface FeishuBitableBuriedPointLifecycleReadOneBatchupdaterecordsInput {
  /** [object Object] */
  records: {
    id: string;
    record: {

    };
  }[];
}

/**
 * capabilityClient.load('feishu_bitable_buried_point_lifecycle_read_1').call<FeishuBitableBuriedPointLifecycleReadOneBatchupdaterecordsOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface FeishuBitableBuriedPointLifecycleReadOneBatchupdaterecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface FeishuBitableBuriedPointLifecycleReadOneDeleterecordsInput {
  /** [object Object] */
  recordIDs: string[];
}

/**
 * capabilityClient.load('feishu_bitable_buried_point_lifecycle_read_1').call<FeishuBitableBuriedPointLifecycleReadOneDeleterecordsOutput>('deleteRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface FeishuBitableBuriedPointLifecycleReadOneDeleterecordsOutput {
  /** [object Object] */
  success: boolean;
}

export interface FeishuBitableBuriedPointLifecycleReadOneGetrecordInput {
  /** [object Object] */
  recordID: string;
}

/**
 * capabilityClient.load('feishu_bitable_buried_point_lifecycle_read_1').call<FeishuBitableBuriedPointLifecycleReadOneGetrecordOutput>('getRecord', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { id, record } = result;
 */
export interface FeishuBitableBuriedPointLifecycleReadOneGetrecordOutput {
  /** [object Object] */
  id: string;
  /** [object Object] */
  record?: {

  };
}

export interface FeishuBitableBuriedPointLifecycleReadOneSearchrecordsInput {
  /** [object Object] */
  fieldNames?: string[];
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
}

/**
 * capabilityClient.load('feishu_bitable_buried_point_lifecycle_read_1').call<FeishuBitableBuriedPointLifecycleReadOneSearchrecordsOutput>('searchRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { hasMore, pageToken, total, ... } = result;
 */
export interface FeishuBitableBuriedPointLifecycleReadOneSearchrecordsOutput {
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  total?: number;
  /** [object Object] */
  records: {
    id: string;
    record: {

    };
  }[];
}
// ---- end:feishu_bitable_buried_point_lifecycle_read_1 ----

// ---- plugin:feishu_bitable_background_publish_quality_access_control_read_1 ----
// ============================================================
// 插件 feishu_bitable_background_publish_quality_access_control_read_1 (读取后台-发布质量门禁表) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneAggregatequeryInput {
  /** [object Object] */
  measures?: {
    fieldName: string;
    aggregation: string;
    alias: string;
  }[];
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
  /** [object Object] */
  expandArrayDimension?: boolean;
  /** [object Object] */
  dimensions?: string[];
}

/**
 * capabilityClient.load('feishu_bitable_background_publish_quality_access_control_read_1').call<FeishuBitableBackgroundPublishQualityAccessControlReadOneAggregatequeryOutput>('aggregateQuery', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { result, hasMore, pageToken } = result;
 */
export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneAggregatequeryOutput {
  /** [object Object] */
  result: {

  }[];
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
}

export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneBatchaddrecordsInput {
  /** [object Object] */
  records: {
    record: {

    };
  }[];
}

/**
 * capabilityClient.load('feishu_bitable_background_publish_quality_access_control_read_1').call<FeishuBitableBackgroundPublishQualityAccessControlReadOneBatchaddrecordsOutput>('batchAddRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneBatchaddrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneBatchupdaterecordsInput {
  /** [object Object] */
  records: {
    id: string;
    record: {

    };
  }[];
}

/**
 * capabilityClient.load('feishu_bitable_background_publish_quality_access_control_read_1').call<FeishuBitableBackgroundPublishQualityAccessControlReadOneBatchupdaterecordsOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneBatchupdaterecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneDeleterecordsInput {
  /** [object Object] */
  recordIDs: string[];
}

/**
 * capabilityClient.load('feishu_bitable_background_publish_quality_access_control_read_1').call<FeishuBitableBackgroundPublishQualityAccessControlReadOneDeleterecordsOutput>('deleteRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneDeleterecordsOutput {
  /** [object Object] */
  success: boolean;
}

export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneGetrecordInput {
  /** [object Object] */
  recordID: string;
}

/**
 * capabilityClient.load('feishu_bitable_background_publish_quality_access_control_read_1').call<FeishuBitableBackgroundPublishQualityAccessControlReadOneGetrecordOutput>('getRecord', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { id, record } = result;
 */
export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneGetrecordOutput {
  /** [object Object] */
  id: string;
  /** [object Object] */
  record?: {

  };
}

export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneSearchrecordsInput {
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      value: string[];
      fieldName: string;
      operator: string;
    }[];
  };
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  fieldNames?: string[];
}

/**
 * capabilityClient.load('feishu_bitable_background_publish_quality_access_control_read_1').call<FeishuBitableBackgroundPublishQualityAccessControlReadOneSearchrecordsOutput>('searchRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records, hasMore, pageToken, ... } = result;
 */
export interface FeishuBitableBackgroundPublishQualityAccessControlReadOneSearchrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
    record: {

    };
  }[];
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  total?: number;
}
// ---- end:feishu_bitable_background_publish_quality_access_control_read_1 ----

// ---- plugin:feishu_bitable_design_parameter_detail_1 ----
// ============================================================
// 插件 feishu_bitable_design_parameter_detail_1 (飞书多维表格「后台-设计参数明细」操作) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface FeishuBitableDesignParameterDetailOneAggregatequeryInput {
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
  /** [object Object] */
  expandArrayDimension?: boolean;
  /** [object Object] */
  dimensions?: string[];
  /** [object Object] */
  measures?: {
    fieldName: string;
    aggregation: string;
    alias: string;
  }[];
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
}

/**
 * capabilityClient.load('feishu_bitable_design_parameter_detail_1').call<FeishuBitableDesignParameterDetailOneAggregatequeryOutput>('aggregateQuery', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { result, hasMore, pageToken } = result;
 */
export interface FeishuBitableDesignParameterDetailOneAggregatequeryOutput {
  /** [object Object] */
  result: {

  }[];
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
}

export interface FeishuBitableDesignParameterDetailOneBatchaddrecordsInput {
  /** [object Object] */
  records: {
    record: {

    };
  }[];
}

/**
 * capabilityClient.load('feishu_bitable_design_parameter_detail_1').call<FeishuBitableDesignParameterDetailOneBatchaddrecordsOutput>('batchAddRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface FeishuBitableDesignParameterDetailOneBatchaddrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface FeishuBitableDesignParameterDetailOneBatchupdaterecordsInput {
  /** [object Object] */
  records: {
    id: string;
    record: {

    };
  }[];
}

/**
 * capabilityClient.load('feishu_bitable_design_parameter_detail_1').call<FeishuBitableDesignParameterDetailOneBatchupdaterecordsOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface FeishuBitableDesignParameterDetailOneBatchupdaterecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface FeishuBitableDesignParameterDetailOneDeleterecordsInput {
  /** [object Object] */
  recordIDs: string[];
}

/**
 * capabilityClient.load('feishu_bitable_design_parameter_detail_1').call<FeishuBitableDesignParameterDetailOneDeleterecordsOutput>('deleteRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface FeishuBitableDesignParameterDetailOneDeleterecordsOutput {
  /** [object Object] */
  success: boolean;
}

export interface FeishuBitableDesignParameterDetailOneGetrecordInput {
  /** [object Object] */
  recordID: string;
}

/**
 * capabilityClient.load('feishu_bitable_design_parameter_detail_1').call<FeishuBitableDesignParameterDetailOneGetrecordOutput>('getRecord', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { id, record } = result;
 */
export interface FeishuBitableDesignParameterDetailOneGetrecordOutput {
  /** [object Object] */
  id: string;
  /** [object Object] */
  record?: {

  };
}

export interface FeishuBitableDesignParameterDetailOneSearchrecordsInput {
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
    conjunction: string;
  };
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  fieldNames?: string[];
}

/**
 * capabilityClient.load('feishu_bitable_design_parameter_detail_1').call<FeishuBitableDesignParameterDetailOneSearchrecordsOutput>('searchRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { hasMore, pageToken, total, ... } = result;
 */
export interface FeishuBitableDesignParameterDetailOneSearchrecordsOutput {
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  total?: number;
  /** [object Object] */
  records: {
    id: string;
    record: {

    };
  }[];
}
// ---- end:feishu_bitable_design_parameter_detail_1 ----

// ---- plugin:feishu_bitable_app_buried_point_readonly_1 ----
// ============================================================
// 插件 feishu_bitable_app_buried_point_readonly_1 (飞书多维表格App埋点查询库只读实例) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface FeishuBitableAppBuriedPointReadonlyOneAggregatequeryInput {
  /** [object Object] */
  measures?: {
    alias: string;
    fieldName: string;
    aggregation: string;
  }[];
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  sort?: {
    desc: boolean;
    fieldName: string;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
  /** [object Object] */
  expandArrayDimension?: boolean;
  /** [object Object] */
  dimensions?: string[];
}

/**
 * capabilityClient.load('feishu_bitable_app_buried_point_readonly_1').call<FeishuBitableAppBuriedPointReadonlyOneAggregatequeryOutput>('aggregateQuery', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { result, hasMore, pageToken } = result;
 */
export interface FeishuBitableAppBuriedPointReadonlyOneAggregatequeryOutput {
  /** [object Object] */
  result: {

  }[];
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
}

export interface FeishuBitableAppBuriedPointReadonlyOneBatchaddrecordsInput {
  /** [object Object] */
  records: {
    record: {

    };
  }[];
}

/**
 * capabilityClient.load('feishu_bitable_app_buried_point_readonly_1').call<FeishuBitableAppBuriedPointReadonlyOneBatchaddrecordsOutput>('batchAddRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface FeishuBitableAppBuriedPointReadonlyOneBatchaddrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface FeishuBitableAppBuriedPointReadonlyOneBatchupdaterecordsInput {
  /** [object Object] */
  records: {
    id: string;
    record: {

    };
  }[];
}

/**
 * capabilityClient.load('feishu_bitable_app_buried_point_readonly_1').call<FeishuBitableAppBuriedPointReadonlyOneBatchupdaterecordsOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface FeishuBitableAppBuriedPointReadonlyOneBatchupdaterecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface FeishuBitableAppBuriedPointReadonlyOneDeleterecordsInput {
  /** [object Object] */
  recordIDs: string[];
}

/**
 * capabilityClient.load('feishu_bitable_app_buried_point_readonly_1').call<FeishuBitableAppBuriedPointReadonlyOneDeleterecordsOutput>('deleteRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface FeishuBitableAppBuriedPointReadonlyOneDeleterecordsOutput {
  /** [object Object] */
  success: boolean;
}

export interface FeishuBitableAppBuriedPointReadonlyOneGetrecordInput {
  /** [object Object] */
  recordID: string;
}

/**
 * capabilityClient.load('feishu_bitable_app_buried_point_readonly_1').call<FeishuBitableAppBuriedPointReadonlyOneGetrecordOutput>('getRecord', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { id, record } = result;
 */
export interface FeishuBitableAppBuriedPointReadonlyOneGetrecordOutput {
  /** [object Object] */
  id: string;
  /** [object Object] */
  record?: {

  };
}

export interface FeishuBitableAppBuriedPointReadonlyOneSearchrecordsInput {
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  fieldNames?: string[];
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
  /** [object Object] */
  pageToken?: string;
}

/**
 * capabilityClient.load('feishu_bitable_app_buried_point_readonly_1').call<FeishuBitableAppBuriedPointReadonlyOneSearchrecordsOutput>('searchRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { pageToken, total, records, ... } = result;
 */
export interface FeishuBitableAppBuriedPointReadonlyOneSearchrecordsOutput {
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  total?: number;
  /** [object Object] */
  records: {
    id: string;
    record: {

    };
  }[];
  /** [object Object] */
  hasMore: boolean;
}
// ---- end:feishu_bitable_app_buried_point_readonly_1 ----

// ---- plugin:feishu_bitable_01_buried_point_design_workbench_1 ----
// ============================================================
// 插件 feishu_bitable_01_buried_point_design_workbench_1 (飞书多维表格「01 埋点设计工作台」主表操作) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface FeishuBitableZeroOneBuriedPointDesignWorkbenchOneInput {
  /** [object Object] */
  recordID: string;
}

/**
 * capabilityClient.load('feishu_bitable_01_buried_point_design_workbench_1').call<FeishuBitableZeroOneBuriedPointDesignWorkbenchOneOutput>('getRecord', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { id, record } = result;
 */
export interface FeishuBitableZeroOneBuriedPointDesignWorkbenchOneOutput {
  /** [object Object] */
  id: string;
  /** [object Object] */
  record?: {

  };
}
// ---- end:feishu_bitable_01_buried_point_design_workbench_1 ----