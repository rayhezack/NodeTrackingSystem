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
    try {
      const result = await this.capabilityService
        .loadWithConfig(config)
        .call('searchRecords', params);
      return result as BitableSearchResult;
    } catch (error) {
      if (this.canUseLocalFallback(error, instanceKey, 'searchRecords')) {
        return this.localFallback.searchRecords(instanceKey, params);
      }
      this.handleError(config.id, 'searchRecords', error);
    }
  }

  async getRecord(
    instanceKey: BitableInstanceKey,
    recordId: string,
  ): Promise<BitableRecord | null> {
    const config = this.getInstanceConfig(instanceKey);
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
      this.handleError(config.id, 'getRecord', error);
    }
  }

  async batchAddRecords(
    instanceKey: BitableInstanceKey,
    records: Record<string, unknown>[],
  ): Promise<{ id: string }[]> {
    const config = this.getInstanceConfig(instanceKey);
    try {
      const result = await this.capabilityService
        .loadWithConfig(config)
        .call('batchAddRecords', {
          records: records.map((r) => ({ record: r })),
      });
      return (result as { records: { id: string }[] }).records;
    } catch (error) {
      if (this.canUseLocalFallback(error, instanceKey, 'batchAddRecords')) {
        return this.localFallback.batchAddRecords(instanceKey, records);
      }
      this.handleError(config.id, 'batchAddRecords', error);
    }
  }

  async batchUpdateRecords(
    instanceKey: BitableInstanceKey,
    updates: { id: string; record: Record<string, unknown> }[],
  ): Promise<{ id: string }[]> {
    const config = this.getInstanceConfig(instanceKey);
    try {
      const result = await this.capabilityService
        .loadWithConfig(config)
        .call('batchUpdateRecords', { records: updates });
      return (result as { records: { id: string }[] }).records;
    } catch (error) {
      if (this.canUseLocalFallback(error, instanceKey, 'batchUpdateRecords')) {
        return this.localFallback.batchUpdateRecords(instanceKey, updates);
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
