import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import {
  BITABLE_APP_TOKENS,
  BITABLE_INSTANCES,
  BITABLE_FIELDS,
  BITABLE_TABLE_IDS,
  type BitableInstanceKey,
} from './bitable.constants';
import {
  isPluginMissingError,
  LocalBitableFallback,
  shouldUseLocalBitableFallback,
} from './local-fallback';

export interface BitableRecord {
  id: string;
  record: Record<string, unknown>;
}

export interface BitableSearchResult {
  hasMore: boolean;
  pageToken?: string;
  total?: number;
  records: BitableRecord[];
}

export interface BitableAggregateItem {
  value: Record<string, unknown>;
}

export interface BitableAggregateResult {
  result: BitableAggregateItem[];
  hasMore: boolean;
  pageToken?: string;
}

export interface BitableFilterCondition {
  fieldName: string;
  operator: string;
  value?: string[];
}

export interface BitableFilter {
  conjunction?: 'and' | 'or';
  conditions: BitableFilterCondition[];
}

export interface BitableSortItem {
  fieldName: string;
  desc?: boolean;
}

type BitableFieldConfig = (typeof BITABLE_FIELDS)[BitableInstanceKey][number];
type BitablePluginConfig = {
  id: string;
  formValue: {
    fields?: BitableFieldConfig[];
  };
};

@Injectable()
export class BitableService {
  private readonly logger = new Logger(BitableService.name);
  private readonly localFallback = new LocalBitableFallback();

  constructor(
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
  ) {}

  private getInstanceConfig(instanceKey: BitableInstanceKey) {
    const instanceId = BITABLE_INSTANCES[instanceKey];
    return {
      id: instanceId,
      pluginKey: '@official-plugins/feishu-bitable',
      pluginVersion: '1.0.22',
      name: instanceId,
      description: instanceId,
      icon: '',
      paramsSchema: {},
      formValue: {
        appToken: BITABLE_APP_TOKENS[instanceKey],
        tableID: BITABLE_TABLE_IDS[instanceKey],
        fields: BITABLE_FIELDS[instanceKey] || [],
      },
      createdAt: 0,
      updatedAt: 0,
      createdBy: 0,
    };
  }

  async searchRecords(
    instanceKey: BitableInstanceKey,
    params: {
      fieldNames?: string[];
      filter?: BitableFilter;
      sort?: BitableSortItem[];
      pageToken?: string;
      pageSize?: number;
    },
  ): Promise<BitableSearchResult> {
    const config = this.getInstanceConfig(instanceKey);
    const safeParams = {
      ...params,
      fieldNames: params.fieldNames ? [...params.fieldNames] : undefined,
    };
    let missingFieldRetryCount = 0;

    try {
      while (true) {
        try {
          const result = await this.capabilityService
            .loadWithConfig(config)
            .call('searchRecords', safeParams);
          return result as BitableSearchResult;
        } catch (error) {
          if (this.canUseLocalFallback(error, instanceKey, 'searchRecords')) {
            return this.localFallback.searchRecords(instanceKey, safeParams);
          }
          const missingFieldName = extractMissingFieldName(error);
          const removedFromParams = removeFieldName(safeParams, missingFieldName);
          const removedFromConfig = this.removeFieldFromConfig(config, missingFieldName);
          if (
            missingFieldName &&
            (removedFromParams || removedFromConfig) &&
            missingFieldRetryCount < 12
          ) {
            missingFieldRetryCount += 1;
            this.logger.warn(
              JSON.stringify({
                message: 'Retrying bitable search without missing field',
                instanceKey,
                missingFieldName,
              }),
            );
            continue;
          }
          this.handleError(config.id, 'searchRecords', error);
        }
      }
    } catch (error) {
      if (this.canUseLocalFallback(error, instanceKey, 'searchRecords')) {
        return this.localFallback.searchRecords(instanceKey, safeParams);
      }
      this.handleError(config.id, 'searchRecords', error);
    }
  }

  async getRecord(
    instanceKey: BitableInstanceKey,
    recordId: string,
  ): Promise<BitableRecord | null> {
    const config = this.getInstanceConfig(instanceKey);
    let missingFieldRetryCount = 0;

    try {
      while (true) {
        try {
          const result = await this.capabilityService
            .loadWithConfig(config)
            .call('getRecord', { recordID: recordId });
          const typed = result as { id: string; record?: Record<string, unknown> };
          if (!typed.record) {
            return null;
          }
          return { id: typed.id, record: typed.record };
        } catch (error) {
          if (this.canUseLocalFallback(error, instanceKey, 'getRecord')) {
            return this.localFallback.getRecord(instanceKey, recordId);
          }
          const missingFieldName = extractMissingFieldName(error);
          if (
            missingFieldName &&
            this.removeFieldFromConfig(config, missingFieldName) &&
            missingFieldRetryCount < 12
          ) {
            missingFieldRetryCount += 1;
            this.logger.warn(
              JSON.stringify({
                message: 'Retrying bitable getRecord without missing field',
                instanceKey,
                missingFieldName,
              }),
            );
            continue;
          }
          this.handleError(config.id, 'getRecord', error);
        }
      }
    } catch (error) {
      if (this.canUseLocalFallback(error, instanceKey, 'getRecord')) {
        return this.localFallback.getRecord(instanceKey, recordId);
      }
      this.handleError(config.id, 'getRecord', error);
    }
  }

  async batchAddRecords(
    instanceKey: BitableInstanceKey,
    records: Record<string, unknown>[],
  ): Promise<{ id: string }[]> {
    const config = this.getInstanceConfig(instanceKey);
    const safeRecords = records.map((record) =>
      this.normalizeRecordForInstance(instanceKey, record),
    );
    let missingFieldRetryCount = 0;

    try {
      while (true) {
        try {
          const result = await this.capabilityService
            .loadWithConfig(config)
            .call('batchAddRecords', {
              records: safeRecords.map((r) => ({ record: r })),
            });
          return (result as { records: { id: string }[] }).records;
        } catch (error) {
          if (this.canUseLocalFallback(error, instanceKey, 'batchAddRecords')) {
            return this.localFallback.batchAddRecords(instanceKey, safeRecords);
          }
          const missingFieldName = extractMissingFieldName(error);
          const removedFromRecords = removeFieldFromRecords(safeRecords, missingFieldName);
          const removedFromConfig = this.removeFieldFromConfig(config, missingFieldName);
          if (
            missingFieldName &&
            (removedFromRecords || removedFromConfig) &&
            missingFieldRetryCount < 12
          ) {
            missingFieldRetryCount += 1;
            this.logger.warn(
              JSON.stringify({
                message: 'Retrying bitable add without missing field',
                instanceKey,
                missingFieldName,
              }),
            );
            continue;
          }
          this.handleError(config.id, 'batchAddRecords', error);
        }
      }
    } catch (error) {
      if (this.canUseLocalFallback(error, instanceKey, 'batchAddRecords')) {
        return this.localFallback.batchAddRecords(instanceKey, safeRecords);
      }
      this.handleError(config.id, 'batchAddRecords', error);
    }
  }

  async batchUpdateRecords(
    instanceKey: BitableInstanceKey,
    updates: { id: string; record: Record<string, unknown> }[],
  ): Promise<{ id: string }[]> {
    const config = this.getInstanceConfig(instanceKey);
    const safeUpdates = updates.map((update) => ({
      ...update,
      record: this.normalizeRecordForInstance(instanceKey, update.record),
    }));
    let missingFieldRetryCount = 0;

    try {
      while (true) {
        try {
          const result = await this.capabilityService
            .loadWithConfig(config)
            .call('batchUpdateRecords', { records: safeUpdates });
          return (result as { records: { id: string }[] }).records;
        } catch (error) {
          if (this.canUseLocalFallback(error, instanceKey, 'batchUpdateRecords')) {
            return this.localFallback.batchUpdateRecords(instanceKey, safeUpdates);
          }
          const missingFieldName = extractMissingFieldName(error);
          const removedFromRecords = removeFieldFromUpdates(safeUpdates, missingFieldName);
          const removedFromConfig = this.removeFieldFromConfig(config, missingFieldName);
          if (
            missingFieldName &&
            (removedFromRecords || removedFromConfig) &&
            missingFieldRetryCount < 12
          ) {
            missingFieldRetryCount += 1;
            this.logger.warn(
              JSON.stringify({
                message: 'Retrying bitable update without missing field',
                instanceKey,
                missingFieldName,
              }),
            );
            continue;
          }
          this.handleError(config.id, 'batchUpdateRecords', error);
        }
      }
    } catch (error) {
      if (this.canUseLocalFallback(error, instanceKey, 'batchUpdateRecords')) {
        return this.localFallback.batchUpdateRecords(instanceKey, safeUpdates);
      }
      this.handleError(config.id, 'batchUpdateRecords', error);
    }
  }

  async deleteRecords(
    instanceKey: BitableInstanceKey,
    recordIds: string[],
  ): Promise<boolean> {
    const config = this.getInstanceConfig(instanceKey);
    try {
      const result = await this.capabilityService
        .loadWithConfig(config)
        .call('deleteRecords', { recordIDs: recordIds });
      return (result as { success: boolean }).success;
    } catch (error) {
      if (this.canUseLocalFallback(error, instanceKey, 'deleteRecords')) {
        return this.localFallback.deleteRecords(instanceKey, recordIds);
      }
      this.handleError(config.id, 'deleteRecords', error);
    }
  }

  async aggregateQuery(
    instanceKey: BitableInstanceKey,
    params: {
      dimensions?: string[];
      measures: { fieldName: string; aggregation: string; alias?: string }[];
      filter?: BitableFilter;
      sort?: BitableSortItem[];
      pageToken?: string;
      pageSize?: number;
      expandArrayDimension?: boolean;
    },
  ): Promise<BitableAggregateResult> {
    const config = this.getInstanceConfig(instanceKey);
    try {
      const result = await this.capabilityService
        .loadWithConfig(config)
        .call('aggregateQuery', params);
      return result as BitableAggregateResult;
    } catch (error) {
      if (this.canUseLocalFallback(error, instanceKey, 'aggregateQuery')) {
        return this.localFallback.aggregateQuery();
      }
      this.handleError(config.id, 'aggregateQuery', error);
    }
  }

  private canUseLocalFallback(
    error: unknown,
    instanceKey: BitableInstanceKey,
    actionKey: string,
  ): boolean {
    if (!isPluginMissingError(error) || !shouldUseLocalBitableFallback()) {
      return false;
    }

    this.logger.warn(
      JSON.stringify({
        message: 'Using local bitable fallback because official plugin is missing in local dev',
        instanceKey,
        actionKey,
      }),
    );
    return true;
  }

  private removeFieldFromConfig(
    config: BitablePluginConfig,
    fieldName: string | null,
  ): boolean {
    if (!fieldName || !config.formValue.fields?.length) return false;
    const before = config.formValue.fields.length;
    config.formValue.fields = config.formValue.fields.filter(
      (field) => field.name !== fieldName,
    );
    return config.formValue.fields.length !== before;
  }

  private normalizeRecordForInstance(
    instanceKey: BitableInstanceKey,
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    const fieldMap = new Map(
      (BITABLE_FIELDS[instanceKey] || []).map((field) => [field.name, field]),
    );
    return Object.fromEntries(
      Object.entries(record).map(([fieldName, value]) => [
        fieldName,
        normalizeCellValue(fieldMap.get(fieldName), value),
      ]),
    );
  }

  private handleError(
    instanceId: string,
    actionKey: string,
    error: unknown,
  ): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    this.logger.error(
      JSON.stringify({
        pluginInstanceId: instanceId,
        actionKey,
        outputMode: 'unary',
        error: errorMessage,
        errorName,
      }),
    );

    if (isPluginMissingError(error)) {
      throw new ServiceUnavailableException(
        '本地缺少飞书 Base 官方插件：请先完成 action-plugin init；线上妙搭发布后会由平台安装插件。',
      );
    }
    if (errorName === 'NotFoundException' || errorMessage.includes('not found') || errorMessage.includes('不存在')) {
      throw new NotFoundException('记录不存在或已被删除');
    }
    if (errorName === 'ForbiddenException' || errorMessage.includes('permission') || errorMessage.includes('权限')) {
      throw new ForbiddenException('Base 权限不足，请联系管理员配置');
    }
    if (errorName === 'InputValidationError' || errorMessage.includes('invalid') || errorMessage.includes('参数')) {
      throw new BadRequestException(`参数错误：${errorMessage}`);
    }
    if (errorMessage.includes('RateLimit') || errorMessage.includes('限流')) {
      throw new BadRequestException('请求过于频繁，请稍后重试');
    }

    throw new BadRequestException(`Base 操作失败：${errorMessage}`);
  }
}

function removeFieldName(
  params: { fieldNames?: string[] },
  fieldName: string | null,
): boolean {
  if (!fieldName || !params.fieldNames?.length) return false;
  const before = params.fieldNames.length;
  params.fieldNames = params.fieldNames.filter((item) => item !== fieldName);
  if (params.fieldNames.length === 0) {
    delete params.fieldNames;
  }
  return params.fieldNames?.length !== before;
}

function removeFieldFromRecords(
  records: Record<string, unknown>[],
  fieldName: string | null,
): boolean {
  if (!fieldName) return false;
  let removed = false;
  for (const record of records) {
    if (Object.prototype.hasOwnProperty.call(record, fieldName)) {
      delete record[fieldName];
      removed = true;
    }
  }
  return removed;
}

function removeFieldFromUpdates(
  updates: { record: Record<string, unknown> }[],
  fieldName: string | null,
): boolean {
  if (!fieldName) return false;
  return removeFieldFromRecords(
    updates.map((update) => update.record),
    fieldName,
  );
}

function normalizeCellValue(
  fieldConfig: BitableFieldConfig | undefined,
  value: unknown,
): unknown {
  if (value == null || !fieldConfig) return value;

  switch (fieldConfig.type) {
    case 3:
      return Array.isArray(value) ? cellText(value[0]) : cellText(value);
    case 4:
      return toStringArray(value);
    case 11:
      return toNumberArray(value);
    case 18:
      return toLinkArray(value);
    default:
      return value;
  }
}

function toStringArray(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[、,，/]/)
      : value
        ? [value]
        : [];
  return Array.from(
    new Set(values.map(cellText).map((item) => item.trim()).filter(Boolean)),
  );
}

function toNumberArray(value: unknown): number[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[、,，/]/)
      : value
        ? [value]
        : [];
  return Array.from(
    new Set(
      values
        .map(extractNumericId)
        .filter((id): id is number => id !== null),
    ),
  );
}

function toLinkArray(value: unknown): unknown {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => {
      if (typeof item === 'string' && item.trim()) return { id: item.trim() };
      if (item && typeof item === 'object') {
        const id = (item as Record<string, unknown>).id;
        if (typeof id === 'string' && id.trim()) return { id: id.trim() };
      }
      return null;
    })
    .filter(Boolean);
}

function extractNumericId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const id = Number(trimmed);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  if (value && typeof value === 'object') {
    const user = value as Record<string, unknown>;
    for (const key of [
      'user_id',
      'userId',
      'userID',
      'miaoda_user_id',
      'miaodaUserID',
      'employee_id',
      'employeeID',
      'id',
    ]) {
      const id = extractNumericId(user[key]);
      if (id !== null) return id;
    }
  }
  return null;
}

function extractMissingFieldName(error: unknown): string | null {
  const text = errorText(error);
  const englishMatch = text.match(/field name\s+(.+?)\s+(?:not exist|does not exist)/i);
  if (englishMatch?.[1]) return cleanFieldName(englishMatch[1]);

  const chineseMatch = text.match(/[「\"]?([^「」\"]+?)[」\"]?字段(?:名)?(?:不存在|不存在于表中)/);
  if (chineseMatch?.[1]) return cleanFieldName(chineseMatch[1]);

  return null;
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message, error.name);
  } else if (error != null) {
    parts.push(String(error));
  }

  const maybeException = error as { getResponse?: () => unknown; response?: unknown };
  try {
    const response = maybeException?.getResponse?.() ?? maybeException?.response;
    if (typeof response === 'string') {
      parts.push(response);
    } else if (response) {
      parts.push(JSON.stringify(response));
    }
  } catch {
    // ignore non-serializable exception payloads
  }
  return parts.filter(Boolean).join(' ');
}

function cleanFieldName(value: string): string {
  return value.trim().replace(/^[「"'“”]+|[」"'“”]+$/g, '');
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(cellText).filter(Boolean).join('、');
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    if (typeof objectValue.name === 'string') return objectValue.name;
    if (typeof objectValue.text === 'string') return objectValue.text;
    if (typeof objectValue.id === 'string' || typeof objectValue.id === 'number') {
      return String(objectValue.id);
    }
  }
  return '';
}
