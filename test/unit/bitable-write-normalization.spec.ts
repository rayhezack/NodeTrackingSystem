import { BitableService } from '../../server/modules/bitable/bitable.service';

describe('Base 写入值标准化', () => {
  it('应忽略空 URL 和空日期，将有效日期转换为时间戳', async () => {
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
            DS验收证据: '',
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

  it('DS 验收证据应按普通文本写入，不强制 URL 格式', async () => {
    const call = jest.fn().mockResolvedValue({ records: [{ id: 'rec_1' }] });
    const capabilityService = {
      loadWithConfig: jest.fn().mockReturnValue({ call }),
    };
    const service = new BitableService(capabilityService as never);

    await service.batchUpdateRecords('workbench', [
      {
        id: 'rec_1',
        record: { DS验收证据: 'SQL 校验通过，样本量 1024，异常率 0.1%' },
      },
    ]);

    expect(call).toHaveBeenCalledWith('batchUpdateRecords', {
      records: [
        {
          id: 'rec_1',
          record: { DS验收证据: 'SQL 校验通过，样本量 1024，异常率 0.1%' },
        },
      ],
    });
  });

  it.each(['workbench', 'webWorkbench'] as const)(
    '%s URL 字段应始终写入飞书要求的链接对象',
    async (instanceKey) => {
      const call = jest.fn().mockResolvedValue({ records: [{ id: 'rec_1' }] });
      const capabilityService = {
        loadWithConfig: jest.fn().mockReturnValue({ call }),
      };
      const service = new BitableService(capabilityService as never);

      await service.batchUpdateRecords(instanceKey, [
        {
          id: 'rec_1',
          record: {
            需求链接: [{ Link: 'https://example.feishu.cn/wiki/test_prd' }],
          },
        },
      ]);

      expect(call).toHaveBeenCalledWith('batchUpdateRecords', {
        records: [
          {
            id: 'rec_1',
            record: {
              需求链接: {
                text: 'https://example.feishu.cn/wiki/test_prd',
                link: 'https://example.feishu.cn/wiki/test_prd',
              },
            },
          },
        ],
      });
    },
  );

  it.each(['queryLibrary', 'webQueryLibrary'] as const)(
    '%s 应标准化归档负责人和稳定归档时间',
    async (instanceKey) => {
      const call = jest.fn().mockResolvedValue({ records: [{ id: 'rec_official' }] });
      const capabilityService = {
        loadWithConfig: jest.fn().mockReturnValue({ call }),
      };
      const service = new BitableService(capabilityService as never);

      await service.batchUpdateRecords(instanceKey, [
        {
          id: 'rec_official',
          record: {
            数据负责人: ['1867390536304713'],
            研发负责人: ['1855461847682347'],
            DS验收人: ['1855461847682347'],
            稳定归档时间: '2026-08-05 14:48:32',
          },
        },
      ]);

      expect(call).toHaveBeenCalledWith('batchUpdateRecords', {
        records: [
          {
            id: 'rec_official',
            record: {
              数据负责人: [1867390536304713],
              研发负责人: [1855461847682347],
              DS验收人: [1855461847682347],
              稳定归档时间: new Date('2026-08-05T14:48:32').getTime(),
            },
          },
        ],
      });
    },
  );

  it.each(['workbench', 'webWorkbench'] as const)(
    '%s UI图应按文本数组写入，避免附件对象触发 Base 插件校验失败',
    async (instanceKey) => {
      const call = jest.fn().mockResolvedValue({ records: [{ id: 'rec_1' }] });
      const capabilityService = {
        loadWithConfig: jest.fn().mockReturnValue({ call }),
      };
      const service = new BitableService(capabilityService as never);

      await service.batchUpdateRecords(instanceKey, [
        {
          id: 'rec_1',
          record: {
            UI图: [
              {
                bucket_id: 'bucket_1',
                file_path: 'images/ui.png',
                url: 'https://example.com/ui.png',
                name: 'ui.png',
              },
            ],
          },
        },
      ]);

      expect(call).toHaveBeenCalledWith('batchUpdateRecords', {
        records: [
          {
            id: 'rec_1',
            record: {
              UI图: ['https://example.com/ui.png'],
            },
          },
        ],
      });
    },
  );

  it.each([
    ['DS验收时间', 'not-a-date'],
    ['发布时间', 'not-a-date'],
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

  it.each(['需求链接'])(
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

  it('Base 返回对象错误时应保留真实错误内容', async () => {
    const call = jest.fn().mockRejectedValue({ error: { message: "the value of 'Link' must be an object" } });
    const capabilityService = {
      loadWithConfig: jest.fn().mockReturnValue({ call }),
    };
    const service = new BitableService(capabilityService as never);

    await expect(
      service.batchUpdateRecords('workbench', [
        { id: 'rec_1', record: { DS验收状态: '通过' } },
      ]),
    ).rejects.toThrow("the value of 'Link' must be an object");
  });

  it('验收证据触发 Link 错误时应指出 Base 字段配置漂移', async () => {
    const call = jest
      .fn()
      .mockRejectedValue({ error: { message: "the value of 'Link' must be an object" } });
    const loadWithConfig = jest.fn().mockReturnValue({ call });
    const capabilityService = { loadWithConfig };
    const service = new BitableService(capabilityService as never);

    await expect(
      service.batchUpdateRecords('webWorkbench', [
        {
          id: 'rec_1',
          record: {
            DS验收状态: '通过',
            DS验收证据: 'SQL 校验通过，样本量 1024',
          },
        },
      ]),
    ).rejects.toThrow('DS验收证据');

    expect(loadWithConfig).toHaveBeenCalledTimes(1);
  });
});
