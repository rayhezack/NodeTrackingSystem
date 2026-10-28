import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { BitableService } from '../../server/modules/bitable/bitable.service';

describe('Base 数据源失败时不返回示例数据', () => {
  const previousEnv = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    jest.restoreAllMocks();
  });

  it.each(['search', 'detail', 'write'] as const)('%s 在插件缺失时明确失败', async (operation) => {
    const call = jest.fn().mockRejectedValue(new Error('Plugin not found: @official-plugins/feishu-bitable'));
    const service = new BitableService({ loadWithConfig: () => ({ call }) } as never);
    const result = operation === 'search'
      ? service.searchRecords('workbench', { pageSize: 10 })
      : operation === 'detail'
        ? service.getRecord('workbench', 'rec_example')
        : service.batchAddRecords('workbench', [{ 事件中文名: '不可虚假保存' }]);
    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
