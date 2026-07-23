import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { BITABLE_APP_TOKEN, BITABLE_INSTANCES, BITABLE_FIELDS, type BitableInstanceKey } from './bitable.constants';

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
  [key: string]: { value: unknown; originValue?: unknown } | undefined;
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
        appToken: BITABLE_APP_TOKEN,
        tableID: this.getTableId(instanceKey),
        fields: BITABLE_FIELDS[instanceKey] || [],
      },
      createdAt: 0,
      updatedAt: 0,
      createdBy: 0,
    };
  }

  private getTableId(instanceKey: BitableInstanceKey): string {
    const tableIdMap: Record<BitableInstanceKey, string> = {
      workbench: 'tblqHhr5aZwr4QOZ',
      paramDetail: 'tblesT69TDCUKzhs',
      qualityGate: 'tblUCH6PxC1sQwXx',
      lifecycle: 'tblJ8G3X1001g9oA',
      queryLibrary: 'tblAhScEFQYAJC2g',
    };
    return tableIdMap[instanceKey];
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
      const raw = result as {
        hasMore: boolean;
        pageToken?: string;
        total?: number;
        records: Array<{ id: string; record?: Record<string, unknown>; fields?: Record<string, unknown> }>;
      };
      return {
        hasMore: raw.hasMore,
        pageToken: raw.pageToken,
        total: raw.total,
        records: (raw.records || []).map((r) => ({
          id: r.id,
          record: r.record || r.fields || {},
        })),
      };
    } catch (error) {
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
      const typed = result as {
        id: string;
        record?: Record<string, unknown>;
        fields?: Record<string, unknown>;
      };
      const record = typed.record || typed.fields;
      if (!record) {
        return null;
      }
      return { id: typed.id, record };
    } catch (error) {
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
      this.handleError(config.id, 'aggregateQuery', error);
    }
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
