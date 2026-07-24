import { BitableService } from '../../server/modules/bitable/bitable.service';

describe('Base 写入值标准化', () => {
  it('应忽略空 URL 和空日期，并将有效日期转换为时间戳', async () => {
    const call = jest.fn().mockResolvedValue({ records: [{ id: 'rec_1' }] });
    const capabilityService = {
      loadWithConfig: jest.fn().mockReturnValue({ call }),
    };
    const service = new BitableService(capabilityService as never);

    await service.batchAddRecords('workbench', [
      {
        事件中文名: '测试需求',
        需求链接: '',
        DS验收证据: '',
        DS验收时间: '',
        稳定归档时间: '2026-07-24 15:30',
      },
    ]);

    expect(call).toHaveBeenCalledWith('batchAddRecords', {
      records: [
        {
          record: {
            事件中文名: '测试需求',
            稳定归档时间: new Date('2026-07-24T15:30').getTime(),
          },
        },
      ],
    });
  });

  it.each(['paramDetail', 'webParamDetail'] as const)(
    '%s 双向关联字段应写为记录 ID 字符串数组',
    async (instanceKey) => {
      const call = jest.fn().mockResolvedValue({ records: [{ id: 'rec_param' }] });
      const capabilityService = {
        loadWithConfig: jest.fn().mockReturnValue({ call }),
      };
      const service = new BitableService(capabilityService as never);

      await service.batchAddRecords(instanceKey, [
        {
          evt_id: 'test_event',
          参数名: 'button_name',
          关联设计: [{ id: 'rec_design' }],
        },
      ]);

      expect(call).toHaveBeenCalledWith('batchAddRecords', {
        records: [
          {
            record: {
              evt_id: 'test_event',
              参数名: 'button_name',
              关联设计: ['rec_design'],
            },
          },
        ],
      });
    },
  );

  it.each([
    ['DS验收时间', 'not-a-date'],
    ['稳定归档时间', '2026-99-99'],
  ])('应在调用 Base 前拒绝非法日期 %s', async (fieldName, value) => {
    const call = jest.fn();
    const capabilityService = {
      loadWithConfig: jest.fn().mockReturnValue({ call }),
    };
    const service = new BitableService(capabilityService as never);

    await expect(
      service.batchUpdateRecords('workbench', [
        { id: 'rec_1', record: { [fieldName]: value } },
      ]),
    ).rejects.toThrow('日期格式错误');
    expect(call).not.toHaveBeenCalled();
  });

  it.each(['需求链接', 'DS验收证据'])(
    '应在调用 Base 前拒绝非法链接 %s',
    async (fieldName) => {
      const call = jest.fn();
      const capabilityService = {
        loadWithConfig: jest.fn().mockReturnValue({ call }),
      };
      const service = new BitableService(capabilityService as never);

      await expect(
        service.batchUpdateRecords('workbench', [
          { id: 'rec_1', record: { [fieldName]: '不是链接' } },
        ]),
      ).rejects.toThrow('链接格式错误');
      expect(call).not.toHaveBeenCalled();
    },
  );
});
