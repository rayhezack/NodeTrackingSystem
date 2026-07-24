import { BITABLE_FIELDS, BITABLE_TABLE_IDS } from '../../server/modules/bitable/bitable.constants';

function fieldIds(instanceKey: keyof typeof BITABLE_FIELDS): Record<string, string> {
  return Object.fromEntries(BITABLE_FIELDS[instanceKey].map((field) => [field.name, field.id]));
}

function fieldByName(instanceKey: keyof typeof BITABLE_FIELDS, name: string) {
  return BITABLE_FIELDS[instanceKey].find((field) => field.name === name);
}

describe('线上 Base 字段契约', () => {
  it('App 与 Web 工作台应使用线上真实字段 ID', () => {
    const expectedSharedIds = {
      evt_id: 'fldsrxaEFF',
      事件中文名: 'fldUCSjKe9',
      流程阶段: 'flda01x39h',
      优先级: 'fldvW2Mwmt',
      端: 'fldDE3SD4L',
      数据负责人: 'flddP9xaKr',
      研发负责人: 'flduVUwRRe',
      DS验收人: 'fldy1MVSYO',
      评审状态: 'fldqOMbbdw',
      埋点开发状态: 'fldRUa4hOE',
      DS验收状态: 'fldBEJ4bPe',
      需求链接: 'fld3tWUeqF',
      DS验收证据: 'fldWc2ndH9',
      DS验收时间: 'fldb2kDxmo',
      稳定归档时间: 'fldks1ggnG',
    };

    expect(fieldIds('workbench')).toMatchObject({
      ...expectedSharedIds,
      需求提出人: 'fldgwGzNsP',
      需求录入人: 'fldOXTa5uB',
      UI图: 'fld6yxssk2',
    });
    expect(fieldIds('webWorkbench')).toMatchObject({
      ...expectedSharedIds,
      需求提出人: 'fld3VkDsty',
      需求录入人: 'fldmXg85mP',
      UI图: 'fldhJiDfHu',
    });
    expect(fieldByName('workbench', 'DS验收证据')).toMatchObject({
      type: 1,
      bizType: 'Text',
      writeable: true,
    });
    expect(fieldByName('webWorkbench', 'DS验收证据')).toMatchObject({
      type: 1,
      bizType: 'Text',
      writeable: true,
    });
  });

  it('App 与 Web 参数表应使用同一套线上字段 ID', () => {
    const expectedIds = {
      设计参数主键: 'fldZ5kcKld',
      evt_id: 'fldWR3XMpR',
      参数名: 'fldKMQGhZb',
      数据类型: 'fldYikrhVb',
      必传规则: 'fldLgmr3Fs',
      条件说明: 'fldJcTZyE5',
      参数定义: 'fldK4NfHfC',
      参数状态: 'fldZyCy2Iv',
      来源设计记录ID: 'fldGIZOLH4',
      关联设计: 'fldGAMGK6Q',
    };

    expect(fieldIds('paramDetail')).toMatchObject({
      ...expectedIds,
      App适用性: 'fldtJMMilx',
    });
    expect(fieldIds('webParamDetail')).toMatchObject({
      ...expectedIds,
      Web适用性: 'fldtJMMilx',
    });
  });

  it('正式查询库事件字段应允许服务端写入', () => {
    const writableFields = ['evt_id', '事件中文名', '端', '上线版本', '状态', '生命周期状态', '参数明细入口', '事件定义', '触发时机', '指标/使用场景'];

    for (const instanceKey of ['queryLibrary', 'webQueryLibrary'] as const) {
      for (const fieldName of writableFields) {
        expect(fieldByName(instanceKey, fieldName)).toMatchObject({
          writeable: true,
        });
      }
      expect(fieldByName(instanceKey, '关联参数明细（系统）')).toMatchObject({
        writeable: false,
      });
    }
  });

  it('正式查询库参数表应允许归档同步写入，并通过参数侧维护双向关联', () => {
    expect(BITABLE_TABLE_IDS).toMatchObject({
      officialParamDetail: 'tblEYv9lGZeenbT2',
      webOfficialParamDetail: 'tblNAMKr5S38iXJQ',
    });

    const writableFields = [
      '参数主键',
      'evt_id',
      '事件中文名',
      '参数名',
      '数据类型',
      '必传规则',
      '条件说明',
      '枚举/取值范围',
      '参数定义',
      '版本',
      '参数状态',
      '事件状态',
      '来源表',
      '关联事件',
      '备注',
    ];

    for (const instanceKey of ['officialParamDetail', 'webOfficialParamDetail'] as const) {
      for (const fieldName of writableFields) {
        expect(fieldByName(instanceKey, fieldName)).toMatchObject({
          writeable: true,
        });
      }
      expect(fieldByName(instanceKey, instanceKey === 'webOfficialParamDetail' ? 'Web适用性' : 'App适用性')).toMatchObject({
        id: 'fldBmL56Ol',
        writeable: true,
      });
      expect(fieldByName(instanceKey, '关联事件')).toMatchObject({
        id: 'fldtVORQx7',
        type: 18,
        writeable: true,
      });
    }
  });
});
