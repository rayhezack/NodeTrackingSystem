import type {
  BitableAggregateResult,
  BitableFilter,
  BitableRecord,
  BitableSearchResult,
} from './bitable.service';
import type { BitableInstanceKey } from './bitable.constants';

const SUNWEN_USER = {
  id: 'ou_dc88ea9baf066ba2f8b0b5fbcb59ca28',
  name: '孙文',
};

const DEV_USER = {
  id: 'ou_local_dev_owner',
  name: '研发负责人',
};

type Dataset = Record<BitableInstanceKey, Map<string, Record<string, unknown>>>;

export function isPluginMissingError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : '';
  return (
    errorName.includes('PluginNotFound') ||
    errorMessage.includes('Plugin not found') ||
    errorMessage.includes('@official-plugins/feishu-bitable')
  );
}

export function shouldUseLocalBitableFallback(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.MIAODA_LOCAL_DEV === 'true';
}

export class LocalBitableFallback {
  private nextId = 1;
  private readonly dataset: Dataset = {
    workbench: new Map([
      [
        'recvqasv6kXTJ1',
        {
          evt_id: 'app_launch',
          '事件中文名': 'App 启动',
          '事件定义': '用户打开 App 并完成初始化时上报，用于衡量启动活跃、渠道质量与首屏性能。',
          '触发时机': 'App 冷启动或热启动完成，首个可交互页面曝光后触发。',
          '需求背景': '统一管理启动事件口径，支撑 DAU、启动漏斗和渠道归因分析。',
          '需求链接': 'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf',
          '指标/使用场景': 'DAU、启动成功率、启动耗时分层、渠道质量评估。',
          '流程阶段': '埋点设计',
          '记录类型': '需求',
          '优先级': 'P1',
          '端': 'iOS、Android',
          '数据负责人': [SUNWEN_USER],
          '研发负责人': [DEV_USER],
          'DS验收人': [SUNWEN_USER],
          '评审状态': '评审中',
          '评审意见': 'MVP 本地预览数据：请确认启动定义、公共属性和必传参数。',
          '埋点开发状态': '未开始',
          'DS验收状态': '未开始',
          'DS验收证据': '',
          'DS验收时间': '',
          '上线监控状态': '未开始',
          '上线监控结论': '',
          '发布门禁状态': '待检查',
          '发布门禁失败原因': '',
          '发布状态': '未发布',
          '发布错误': '',
          '正式状态': '未归档',
          '版本': '1.0.0',
          '最低版本': '1.0.0',
          '变更类型': '新增',
          '处理方': '客户端',
          '公共属性要求': 'user_id、device_id、app_version、platform、network_type、channel',
          '参数拆行状态': '已拆行',
          '稳定归档时间': '',
          '创建时间': Date.now(),
        },
      ],
      [
        'rec_local_checkout_click',
        {
          evt_id: 'checkout_click',
          '事件中文名': '支付按钮点击',
          '事件定义': '用户在订单确认页点击支付按钮时上报。',
          '触发时机': '点击支付 CTA 后、调起支付前触发。',
          '需求背景': '用于分析下单转化漏斗和支付入口点击质量。',
          '需求链接': '',
          '指标/使用场景': '支付点击率、下单漏斗、支付失败归因。',
          '流程阶段': '埋点开发',
          '记录类型': '需求',
          '优先级': 'P1',
          '端': 'iOS、Android',
          '数据负责人': [SUNWEN_USER],
          '研发负责人': [DEV_USER],
          'DS验收人': [SUNWEN_USER],
          '评审状态': '已通过',
          '评审意见': '',
          '埋点开发状态': '开发中',
          'DS验收状态': '未开始',
          'DS验收证据': '',
          'DS验收时间': '',
          '上线监控状态': '未开始',
          '上线监控结论': '',
          '发布门禁状态': '通过',
          '发布门禁失败原因': '',
          '发布状态': '未发布',
          '发布错误': '',
          '正式状态': '未归档',
          '版本': '1.0.0',
          '最低版本': '1.0.0',
          '变更类型': '新增',
          '处理方': '客户端',
          '公共属性要求': 'order_id、sku_count、pay_amount、currency',
          '参数拆行状态': '已拆行',
          '稳定归档时间': '',
          '创建时间': Date.now() - 3600_000,
        },
      ],
    ]),
    paramDetail: new Map([
      [
        'rec_param_launch_type',
        {
          '设计参数主键': 'app_launch.launch_type',
          evt_id: 'app_launch',
          '参数名': 'launch_type',
          '数据类型': 'STRING',
          '必传规则': '必传',
          '条件说明': '',
          '枚举/取值范围': 'cold、hot、push、deeplink',
          '参数定义': '启动类型，用于区分冷启动、热启动和外部唤起。',
          '默认值/示例': 'cold',
          'App适用性': 'App通用',
          '参数状态': '草稿',
          '版本': '1.0.0',
          '变更类型': '新增',
          '来源设计记录ID': 'recvqasv6kXTJ1',
          '关联设计': [{ id: 'recvqasv6kXTJ1' }],
        },
      ],
      [
        'rec_param_entry_source',
        {
          '设计参数主键': 'app_launch.entry_source',
          evt_id: 'app_launch',
          '参数名': 'entry_source',
          '数据类型': 'STRING',
          '必传规则': '条件必传',
          '条件说明': '外部渠道或 Push 唤起时必传。',
          '枚举/取值范围': 'organic、push、deeplink、ad',
          '参数定义': '启动来源，用于评估渠道带来的启动行为。',
          '默认值/示例': 'organic',
          'App适用性': 'App通用',
          '参数状态': '草稿',
          '版本': '1.0.0',
          '变更类型': '新增',
          '来源设计记录ID': 'recvqasv6kXTJ1',
          '关联设计': [{ id: 'recvqasv6kXTJ1' }],
        },
      ],
      [
        'rec_param_start_cost_ms',
        {
          '设计参数主键': 'app_launch.start_cost_ms',
          evt_id: 'app_launch',
          '参数名': 'start_cost_ms',
          '数据类型': 'INTEGER',
          '必传规则': '非必传',
          '条件说明': '',
          '枚举/取值范围': '>=0',
          '参数定义': '从进程启动到首页可交互的耗时，单位毫秒。',
          '默认值/示例': '820',
          'App适用性': 'App通用',
          '参数状态': '草稿',
          '版本': '1.0.0',
          '变更类型': '新增',
          '来源设计记录ID': 'recvqasv6kXTJ1',
          '关联设计': [{ id: 'recvqasv6kXTJ1' }],
        },
      ],
      [
        'rec_param_checkout_order_id',
        {
          '设计参数主键': 'checkout_click.order_id',
          evt_id: 'checkout_click',
          '参数名': 'order_id',
          '数据类型': 'STRING',
          '必传规则': '必传',
          '条件说明': '',
          '枚举/取值范围': '',
          '参数定义': '订单唯一标识。',
          '默认值/示例': 'ord_123',
          'App适用性': 'App通用',
          '参数状态': '已评审',
          '版本': '1.0.0',
          '变更类型': '新增',
          '来源设计记录ID': 'rec_local_checkout_click',
          '关联设计': [{ id: 'rec_local_checkout_click' }],
        },
      ],
    ]),
    qualityGate: new Map(),
    lifecycle: new Map(),
    queryLibrary: new Map([
      [
        'rec_official_app_launch',
        {
          evt_id: 'app_launch',
          '事件中文名': 'App 启动',
          '端': 'iOS、Android',
          '上线版本': '1.0.0',
          '状态': '已上线',
          '生命周期状态': '稳定',
          '参数明细入口': 'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf',
          '事件定义': '用户打开 App 并完成初始化时上报。',
          '触发时机': '冷启动或热启动完成后触发。',
          '指标/使用场景': 'DAU、启动成功率、启动性能。',
        },
      ],
    ]),
  };

  searchRecords(
    instanceKey: BitableInstanceKey,
    params: {
      fieldNames?: string[];
      filter?: BitableFilter;
      pageToken?: string;
      pageSize?: number;
    },
  ): BitableSearchResult {
    const rows = Array.from(this.dataset[instanceKey].entries())
      .map(([id, record]) => ({ id, record }))
      .filter((record) => matchesFilter(record.record, params.filter));

    const pageSize = params.pageSize || 200;
    const offset = Number(params.pageToken || 0);
    const records = rows
      .slice(offset, offset + pageSize)
      .map((record) => projectRecord(record, params.fieldNames));

    const nextOffset = offset + pageSize;
    return {
      records,
      hasMore: nextOffset < rows.length,
      pageToken: nextOffset < rows.length ? String(nextOffset) : undefined,
      total: rows.length,
    };
  }

  getRecord(instanceKey: BitableInstanceKey, recordId: string): BitableRecord | null {
    const record = this.dataset[instanceKey].get(recordId);
    return record ? cloneRecord({ id: recordId, record }) : null;
  }

  batchAddRecords(
    instanceKey: BitableInstanceKey,
    records: Record<string, unknown>[],
  ): { id: string }[] {
    return records.map((record) => {
      const id = `rec_local_${Date.now()}_${this.nextId++}`;
      this.dataset[instanceKey].set(id, cloneValue(record) as Record<string, unknown>);
      return { id };
    });
  }

  batchUpdateRecords(
    instanceKey: BitableInstanceKey,
    updates: { id: string; record: Record<string, unknown> }[],
  ): { id: string }[] {
    return updates.map((update) => {
      const current = this.dataset[instanceKey].get(update.id) || {};
      const patch = cloneValue(update.record) as Record<string, unknown>;
      this.dataset[instanceKey].set(update.id, { ...current, ...patch });
      return { id: update.id };
    });
  }

  deleteRecords(instanceKey: BitableInstanceKey, recordIds: string[]): boolean {
    for (const recordId of recordIds) {
      this.dataset[instanceKey].delete(recordId);
    }
    return true;
  }

  aggregateQuery(): BitableAggregateResult {
    return { result: [], hasMore: false };
  }
}

function projectRecord(record: BitableRecord, fieldNames?: string[]): BitableRecord {
  if (!fieldNames?.length) {
    return cloneRecord(record);
  }
  return {
    id: record.id,
    record: Object.fromEntries(
      fieldNames.map((fieldName) => [fieldName, cloneValue(record.record[fieldName])]),
    ),
  };
}

function matchesFilter(record: Record<string, unknown>, filter?: BitableFilter): boolean {
  if (!filter?.conditions?.length) return true;
  const results = filter.conditions.map((condition) => {
    const actual = cellText(record[condition.fieldName]);
    const values = condition.value || [];
    if (condition.operator === 'is') {
      return values.includes(actual);
    }
    if (condition.operator === 'contains') {
      return values.some((value) => actual.includes(value));
    }
    if (condition.operator === 'isEmpty') {
      return !actual;
    }
    if (condition.operator === 'isNotEmpty') {
      return Boolean(actual);
    }
    return true;
  });
  return filter.conjunction === 'or' ? results.some(Boolean) : results.every(Boolean);
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => cellText(item)).filter(Boolean).join('、');
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    if (typeof objectValue.name === 'string') return objectValue.name;
    if (typeof objectValue.text === 'string') return objectValue.text;
    if (typeof objectValue.id === 'string') return objectValue.id;
  }
  return '';
}

function cloneRecord(record: BitableRecord): BitableRecord {
  return { id: record.id, record: cloneValue(record.record) as Record<string, unknown> };
}

function cloneValue(value: unknown): unknown {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
