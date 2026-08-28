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

type BitableSearchParams = {
  fieldNames?: string[];
  filter?: BitableFilter;
  sort?: BitableSortItem[];
  pageToken?: string;
  pageSize?: number;
};

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
  private readonly searchCacheTtlMs = 10_000;
  private readonly searchCache = new Map<string, { expiresAt: number; result: BitableSearchResult }>();
  private readonly pendingSearches = new Map<string, Promise<BitableSearchResult>>();
  private searchCacheVersion = 0;

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
    params: BitableSearchParams,
  ): Promise<BitableSearchResult> {
    const safeParams = {
      ...params,
      fieldNames: params.fieldNames ? [...params.fieldNames] : undefined,
    };
    const cacheKey = getSearchCacheKey(instanceKey, safeParams);
    const cached = this.getCachedSearchResult(cacheKey);
    if (cached) return cached;

    const pendingSearch = this.pendingSearches.get(cacheKey);
    if (pendingSearch) {
      return cloneSearchResult(await pendingSearch);
    }

    const cacheVersion = this.searchCacheVersion;
    const searchPromise = this.searchRecordsUncached(instanceKey, safeParams);
    this.pendingSearches.set(cacheKey, searchPromise);

    try {
      const result = await searchPromise;
      if (this.searchCacheVersion === cacheVersion) {
        this.setCachedSearchResult(cacheKey, result);
      }
      return cloneSearchResult(result);
    } finally {
      if (this.pendingSearches.get(cacheKey) === searchPromise) {
        this.pendingSearches.delete(cacheKey);
      }
    }
  }

  private async searchRecordsUncached(
    instanceKey: BitableInstanceKey,
    safeParams: BitableSearchParams,
  ): Promise<BitableSearchResult> {
    const config = this.getInstanceConfig(instanceKey);
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
    this.invalidateSearchCache(instanceKey);
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
          assertNoAcceptanceEvidenceSchemaDrift(error, safeRecords);
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
    this.invalidateSearchCache(instanceKey);
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
          assertNoAcceptanceEvidenceSchemaDrift(
            error,
            safeUpdates.map((update) => update.record),
          );
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
    this.invalidateSearchCache(instanceKey);
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

  private getCachedSearchResult(cacheKey: string): BitableSearchResult | null {
    const cached = this.searchCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.searchCache.delete(cacheKey);
      return null;
    }
    return cloneSearchResult(cached.result);
  }

  private setCachedSearchResult(cacheKey: string, result: BitableSearchResult): void {
    this.searchCache.set(cacheKey, {
      expiresAt: Date.now() + this.searchCacheTtlMs,
      result: cloneSearchResult(result),
    });
  }

  private invalidateSearchCache(instanceKey?: BitableInstanceKey): void {
    this.searchCacheVersion += 1;
    if (!instanceKey) {
      this.searchCache.clear();
      this.pendingSearches.clear();
      return;
    }
    const prefix = `${instanceKey}:`;
    for (const cacheKey of this.searchCache.keys()) {
      if (cacheKey.startsWith(prefix)) {
        this.searchCache.delete(cacheKey);
      }
    }
    for (const cacheKey of this.pendingSearches.keys()) {
      if (cacheKey.startsWith(prefix)) {
        this.pendingSearches.delete(cacheKey);
      }
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
      Object.entries(record)
        .filter(([fieldName]) => fieldMap.get(fieldName)?.writeable !== false)
        .map(([fieldName, value]) => [
          fieldName,
          normalizeCellValue(fieldMap.get(fieldName), value),
        ] as const)
        .filter(([, value]) => value !== undefined),
    );
  }

  private handleError(
    instanceId: string,
    actionKey: string,
    error: unknown,
  ): never {
    if (error instanceof BadRequestException) {
      throw error;
    }
    const errorMessage = errorText(error);
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

function getSearchCacheKey(
  instanceKey: BitableInstanceKey,
  params: BitableSearchParams,
): string {
  return `${instanceKey}:${JSON.stringify(params)}`;
}

function cloneSearchResult(result: BitableSearchResult): BitableSearchResult {
  return JSON.parse(JSON.stringify(result)) as BitableSearchResult;
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

function assertNoAcceptanceEvidenceSchemaDrift(
  error: unknown,
  records: Record<string, unknown>[],
): void {
  const writesAcceptanceEvidence = records.some((record) =>
    Object.prototype.hasOwnProperty.call(record, 'DS验收证据'),
  );
  if (
    writesAcceptanceEvidence &&
    /value of ['"]link['"] must be an object/i.test(errorText(error))
  ) {
    throw new BadRequestException(
      'Base 字段配置错误：「DS验收证据」必须为普通文本（style.type=plain），当前被配置为超链接。请修复对应工作台字段后重试。',
    );
  }
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
    case 5:
      return toDateTimeCell(value);
    case 11:
      return toNumberArray(value);
    case 15:
      return toUrlCell(value);
    case 17:
      return toFileAttachmentArray(value);
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

function toDateTimeCell(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('日期字段格式错误，请使用有效日期时间');
  }

  const text = value.trim();
  if (!text) return undefined;
  const localDateTime = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(text)
    ? text.replace(' ', 'T')
    : text;
  const timestamp = Date.parse(localDateTime);
  if (!Number.isFinite(timestamp)) {
    throw new BadRequestException(`日期格式错误：${text}`);
  }
  return timestamp;
}

function toUrlCell(value: unknown): { text: string; link: string } | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return toUrlCell(value.find((item) => item != null && item !== ''));
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;
    const linkValue = objectValue.link || objectValue.Link || objectValue.url || objectValue.href;
    const link = cellText(linkValue).trim();
    const text = cellText(objectValue.text || objectValue.name || link).trim();
    if (!link) return undefined;
    assertHttpUrl(link);
    return { text: text || link, link };
  }

  const link = cellText(value).trim();
  if (!link) return undefined;
  assertHttpUrl(link);
  return { text: link, link };
}

function assertHttpUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return;
  } catch {
    // Fall through to the consistent API error below.
  }
  throw new BadRequestException(`链接格式错误：${value}`);
}

function toFileAttachmentArray(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : value
      ? [value]
      : [];

  return Array.from(
    new Set(
      values
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          if (!item || typeof item !== 'object') return '';
          const file = item as Record<string, unknown>;
          return (
            cellText(file.url || file.download_url || file.downloadUrl || file.link).trim() ||
            cellText(file.file_path || file.filePath).trim() ||
            cellText(file.name || file.fileName || file.id).trim()
          );
        })
        .filter(Boolean),
    ),
  );
}

function toLinkArray(value: unknown): unknown {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => {
      if (typeof item === 'string' && item.trim()) return item.trim();
      if (item && typeof item === 'object') {
        const id = (item as Record<string, unknown>).id;
        if (typeof id === 'string' && id.trim()) return id.trim();
      }
      return null;
    })
    .filter(Boolean);
}

function extractNumericId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const id = Number(trimmed);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException(`人员 ID 超出安全范围：${trimmed}`);
    }
    return id;
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
    if (typeof error === 'object') {
      const objectError = error as Record<string, unknown>;
      for (const key of ['message', 'error', 'detail', 'details']) {
        const value = objectError[key];
        if (typeof value === 'string' && value.trim()) parts.push(value.trim());
        else if (value && typeof value === 'object') parts.push(JSON.stringify(value));
      }
      if (!parts.length) {
        try {
          parts.push(JSON.stringify(error));
        } catch {
          parts.push(String(error));
        }
      }
    } else {
      parts.push(String(error));
    }
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
    if (typeof objectValue.link === 'string') return objectValue.link;
    if (typeof objectValue.url === 'string') return objectValue.url;
    if (typeof objectValue.text === 'string') return objectValue.text;
    if (typeof objectValue.id === 'string' || typeof objectValue.id === 'number') {
      return String(objectValue.id);
    }
  }
  return '';
}
