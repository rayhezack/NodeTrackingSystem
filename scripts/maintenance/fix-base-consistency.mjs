#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const CLI = '/Users/ray/.codex/skills/feishu-sunwen-cli/scripts/sunwen-lark-cli';
const execute = process.argv.includes('--execute');
const verbose = process.argv.includes('--verbose');

const SOURCES = [
  {
    key: 'app',
    baseToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf',
    workbenchTable: 'tblqHhr5aZwr4QOZ',
    designParamTable: 'tblesT69TDCUKzhs',
    enumTable: 'tblQ8Ph3N8GJHeVA',
    officialEventTable: 'tblAhScEFQYAJC2g',
    officialParamTable: 'tblEYv9lGZeenbT2',
    deprecatedEventTable: 'tblBioKXiaou302p',
    deprecatedParamTable: 'tbl3HA2sLaHuxRD1',
  },
  {
    key: 'web',
    baseToken: 'EX4RbTvp9agYNws6PIHcKD20nqf',
    workbenchTable: 'tblsFFvYkTPkabFT',
    designParamTable: 'tblMaw89yVi68YY6',
    enumTable: 'tbl2KEj2zyg8bOmk',
    officialEventTable: 'tbly7VI4kwFz5qwR',
    officialParamTable: 'tblNAMKr5S38iXJQ',
    deprecatedEventTable: 'tblqwh7naUc3WxNz',
    deprecatedParamTable: 'tblKjUGEx3mxICcY',
  },
];

const STAGE_ORDER = ['需求录入', '埋点设计', '评审通过', '埋点开发', '数据验收', '上线监控', '稳定归档', '已废弃'];
const WORKFLOW_FIELDS = [
  '流程阶段',
  '评审状态',
  '评审意见',
  '埋点开发状态',
  'DS验收状态',
  'DS验收证据',
  'DS验收时间',
  '发布门禁状态',
  '发布门禁失败原因',
  '发布状态',
  '发布错误',
  '上线监控状态',
  '上线监控结论',
  '发布时间',
  '正式状态',
  '稳定归档时间',
];

const summary = {};

for (const source of SOURCES) {
  summary[source.key] = await fixSource(source);
}

console.log(JSON.stringify({ execute, summary }, null, 2));

async function fixSource(source) {
  const result = {
    enumCreated: 0,
    enumUpdated: 0,
    designParamEnumLinksUpdated: 0,
    officialParamEnumLinksUpdated: 0,
    workflowRecordsUpdated: 0,
    deprecatedEventsUpserted: 0,
    deprecatedParamsUpserted: 0,
    officialEventsDeleted: 0,
    officialParamsDeleted: 0,
    archivedDesignParamsDeleted: 0,
  };

  const [
    workbenchRecords,
    designParams,
    enumRecords,
    officialEvents,
    officialParams,
    deprecatedEvents,
    deprecatedParams,
  ] = await Promise.all([
    listRecords(source.baseToken, source.workbenchTable),
    listRecords(source.baseToken, source.designParamTable),
    listRecords(source.baseToken, source.enumTable),
    listRecords(source.baseToken, source.officialEventTable),
    listRecords(source.baseToken, source.officialParamTable),
    listRecords(source.baseToken, source.deprecatedEventTable),
    listRecords(source.baseToken, source.deprecatedParamTable),
  ]);

  const enumByKey = new Map(enumRecords.map((record) => [text(record.record['枚举主键']).toLowerCase(), record]).filter(([key]) => key));
  const enumRecordsToCreate = [];
  const enumRecordsToUpdate = [];
  collectEnumRows(designParams, 'design', enumByKey, enumRecordsToCreate, enumRecordsToUpdate);
  collectEnumRows(officialParams, 'official', enumByKey, enumRecordsToCreate, enumRecordsToUpdate);
  const mergedEnumRecordsToCreate = mergeEnumRows(enumRecordsToCreate);
  const mergedEnumRecordsToUpdate = mergeEnumUpdates(enumRecordsToUpdate);

  if (execute) {
    await batchCreate(source.baseToken, source.enumTable, [
      '枚举主键',
      'evt_id',
      '参数名',
      '枚举值',
      '枚举中文名',
      '枚举定义',
      '关联设计参数',
      '关联正式参数',
      '枚举状态',
      '首次版本',
    ], mergedEnumRecordsToCreate);
    for (const update of mergedEnumRecordsToUpdate) {
      upsertRecord(source.baseToken, source.enumTable, update.record, update.id);
    }
  }
  result.enumCreated = mergedEnumRecordsToCreate.length;
  result.enumUpdated = mergedEnumRecordsToUpdate.length;

  const refreshedEnumRecords = execute && enumRecordsToCreate.length
    ? await listRecords(source.baseToken, source.enumTable)
    : enumRecords;
  const refreshedEnumByKey = new Map(refreshedEnumRecords.map((record) => [text(record.record['枚举主键']).toLowerCase(), record]).filter(([key]) => key));

  result.designParamEnumLinksUpdated = await updateParamEnumLinks(source, source.designParamTable, designParams, refreshedEnumByKey, execute);
  result.officialParamEnumLinksUpdated = await updateParamEnumLinks(source, source.officialParamTable, officialParams, refreshedEnumByKey, execute);
  result.workflowRecordsUpdated = await fixWorkflowState(source, workbenchRecords, execute);

  const deprecatedEventByKey = new Map(deprecatedEvents.map((record) => [text(record.record['废弃主键']).toLowerCase(), record]).filter(([key]) => key));
  const deprecatedParamByKey = new Map(deprecatedParams.map((record) => [text(record.record['废弃参数主键']).toLowerCase(), record]).filter(([key]) => key));
  const deprecatedEventRows = [];
  const deprecatedParamRows = [];
  const officialEventIdsToDelete = new Set();
  const officialParamIdsToDelete = new Set();
  const archivedDesignParamIdsToDelete = new Set();

  const workbenchById = new Map(workbenchRecords.map((record) => [record.id, record]));
  const officialEventByEvtId = new Map(officialEvents.map((record) => [text(record.record.evt_id).toLowerCase(), record]).filter(([key]) => key));
  const officialParamsByKey = new Map(officialParams.map((record) => [officialParamKey(record.record).toLowerCase(), record]).filter(([key]) => key));

  for (const designRecord of workbenchRecords.filter(isBusinessWorkbenchRecord)) {
    const evtId = text(designRecord.record.evt_id);
    if (!evtId) continue;
    const officialEvent = officialEventByEvtId.get(evtId.toLowerCase());
    const relatedOfficialParams = officialParams.filter((param) => isOfficialParamForEvent(param, officialEvent?.id || '', evtId));
    const relatedDesignParams = designParams.filter((param) => isDesignParamForRecord(param, designRecord.id, evtId));

    if (shouldMoveEventToDeprecated(designRecord.record)) {
      deprecatedEventRows.push(toDeprecatedEventRow(designRecord, officialEvent));
      relatedDesignParams.forEach((param) => deprecatedParamRows.push(toDeprecatedParamRow(designRecord.record, param, '设计参数明细', param.id, officialParamsByKey.get(designParamKey(param.record).toLowerCase())?.id || '')));
      relatedOfficialParams.forEach((param) => {
        deprecatedParamRows.push(toDeprecatedParamRow(designRecord.record, param, '正式参数明细', '', param.id));
        officialParamIdsToDelete.add(param.id);
      });
      if (officialEvent) officialEventIdsToDelete.add(officialEvent.id);
      continue;
    }

    if (isFinalStage(designRecord.record)) {
      for (const param of relatedDesignParams.filter((item) => isRemovedDesignParam(item.record))) {
        const officialParam = officialParamsByKey.get(designParamKey(param.record).toLowerCase());
        deprecatedParamRows.push(toDeprecatedParamRow(designRecord.record, param, '设计参数明细', param.id, officialParam?.id || ''));
        if (officialParam) officialParamIdsToDelete.add(officialParam.id);
        archivedDesignParamIdsToDelete.add(param.id);
      }
    }
  }

  for (const officialEvent of officialEvents.filter((record) => text(record.record['状态']) === '已废弃' || text(record.record['生命周期状态']) === '已废弃')) {
    deprecatedEventRows.push(toDeprecatedEventRow({ id: '', record: officialEvent.record }, officialEvent));
    officialEventIdsToDelete.add(officialEvent.id);
  }
  for (const officialParam of officialParams.filter((record) => ['废弃', '已废弃'].includes(text(record.record['参数状态'])))) {
    deprecatedParamRows.push(toDeprecatedParamRow({}, officialParam, '正式参数明细', '', officialParam.id));
    officialParamIdsToDelete.add(officialParam.id);
  }

  const uniqueDeprecatedEvents = uniqueRowsByKey(deprecatedEventRows.filter(Boolean), '废弃主键');
  const uniqueDeprecatedParams = uniqueRowsByKey(deprecatedParamRows.filter(Boolean), '废弃参数主键');
  result.deprecatedEventsUpserted = await upsertByKey(source.baseToken, source.deprecatedEventTable, uniqueDeprecatedEvents, deprecatedEventByKey, execute);
  result.deprecatedParamsUpserted = await upsertByKey(source.baseToken, source.deprecatedParamTable, uniqueDeprecatedParams, deprecatedParamByKey, execute);

  if (execute) {
    await deleteRecords(source.baseToken, source.officialParamTable, Array.from(officialParamIdsToDelete));
    await deleteRecords(source.baseToken, source.officialEventTable, Array.from(officialEventIdsToDelete));
    await deleteRecords(source.baseToken, source.designParamTable, Array.from(archivedDesignParamIdsToDelete));
  }
  result.officialParamsDeleted = officialParamIdsToDelete.size;
  result.officialEventsDeleted = officialEventIdsToDelete.size;
  result.archivedDesignParamsDeleted = archivedDesignParamIdsToDelete.size;
  return result;
}

function listRecords(baseToken, tableId) {
  const records = [];
  const limit = 500;
  let offset = 0;
  while (true) {
    const output = runCli([
      'base',
      '+record-list',
      '--base-token',
      baseToken,
      '--table-id',
      tableId,
      '--limit',
      String(limit),
      '--offset',
      String(offset),
      '--as',
      'user',
      '--format',
      'json',
    ]);
    const data = output.data || {};
    const fields = data.fields || [];
    const recordIds = data.record_id_list || [];
    const rows = data.data || [];
    for (let index = 0; index < rows.length; index += 1) {
      records.push({
        id: recordIds[index],
        record: Object.fromEntries(fields.map((field, fieldIndex) => [field, rows[index][fieldIndex]])),
      });
    }
    if (!data.has_more || rows.length === 0) break;
    offset += limit;
  }
  return records;
}

function collectEnumRows(params, mode, enumByKey, rowsToCreate, rowsToUpdate) {
  for (const param of params) {
    const evtId = text(param.record.evt_id);
    const paramName = text(param.record['参数名']);
    if (!evtId || !paramName) continue;
    const entries = parseEnumEntries(evtId, paramName, text(param.record['枚举/取值范围']));
    if (!entries.length) continue;
    const linkedField = mode === 'design' ? '关联设计参数' : '关联正式参数';
    const status = mode === 'official' ? '正式' : isRemovedDesignParam(param.record) ? '已废弃' : '草稿';
    for (const entry of entries) {
      const existing = enumByKey.get(entry.key.toLowerCase());
      const row = {
        枚举主键: entry.key,
        evt_id: evtId,
        参数名: paramName,
        枚举值: entry.value,
        枚举中文名: entry.label,
        枚举定义: entry.definition,
        关联设计参数: mode === 'design' ? [{ id: param.id }] : [],
        关联正式参数: mode === 'official' ? [{ id: param.id }] : [],
        枚举状态: status,
        首次版本: text(param.record['版本']) || '1.0.0',
      };
      if (existing) {
        const patch = {
          ...row,
          关联设计参数: mergeLinks(existing.record['关联设计参数'], row.关联设计参数),
          关联正式参数: mergeLinks(existing.record['关联正式参数'], row.关联正式参数),
          首次版本: text(existing.record['首次版本']) || row.首次版本,
          枚举状态: status === '正式' || text(existing.record['枚举状态']) !== '正式' ? status : '正式',
        };
        if (recordNeedsPatch(existing.record, patch)) {
          rowsToUpdate.push({ id: existing.id, record: patch });
        }
      } else {
        rowsToCreate.push(row);
      }
    }
  }
}

function mergeEnumRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = text(row['枚举主键']).toLowerCase();
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row });
      continue;
    }
    existing.关联设计参数 = mergeLinks(existing.关联设计参数, row.关联设计参数);
    existing.关联正式参数 = mergeLinks(existing.关联正式参数, row.关联正式参数);
    existing.枚举状态 = row.枚举状态 === '正式' || existing.枚举状态 !== '正式' ? row.枚举状态 : '正式';
    existing.首次版本 = existing.首次版本 || row.首次版本;
  }
  return Array.from(map.values());
}

function mergeEnumUpdates(updates) {
  const map = new Map();
  for (const update of updates) {
    const existing = map.get(update.id);
    if (!existing) {
      map.set(update.id, { id: update.id, record: { ...update.record } });
      continue;
    }
    existing.record = {
      ...existing.record,
      ...update.record,
      关联设计参数: mergeLinks(existing.record.关联设计参数, update.record.关联设计参数),
      关联正式参数: mergeLinks(existing.record.关联正式参数, update.record.关联正式参数),
      枚举状态: update.record.枚举状态 === '正式' || existing.record.枚举状态 !== '正式' ? update.record.枚举状态 : '正式',
      首次版本: existing.record.首次版本 || update.record.首次版本,
    };
  }
  return Array.from(map.values());
}

async function updateParamEnumLinks(source, tableId, params, enumByKey, shouldExecute) {
  let updated = 0;
  for (const param of params) {
    const evtId = text(param.record.evt_id);
    const paramName = text(param.record['参数名']);
    if (!evtId || !paramName) continue;
    const linkIds = parseEnumEntries(evtId, paramName, text(param.record['枚举/取值范围']))
      .map((entry) => enumByKey.get(entry.key.toLowerCase())?.id)
      .filter(Boolean);
    if (!linkIds.length) continue;
    if (sameIds(linkIds, linkIdsFromCell(param.record['枚举字典']))) continue;
    updated += 1;
    if (shouldExecute) {
      upsertRecord(source.baseToken, tableId, { 枚举字典: linkIds.map((id) => ({ id })) }, param.id);
    }
  }
  return updated;
}

async function fixWorkflowState(source, records, shouldExecute) {
  const businessRecords = records.filter(isBusinessWorkbenchRecord);
  const groups = new Map();
  for (const record of businessRecords) {
    const requestId = text(record.record['需求ID']);
    if (!requestId) continue;
    if (!groups.has(requestId)) groups.set(requestId, []);
    groups.get(requestId).push(record);
  }

  let updated = 0;
  for (const groupRecords of groups.values()) {
    if (groupRecords.length < 2) continue;
    const workflowRecord = groupRecords
      .slice()
      .sort((a, b) => stageIndex(b.record) - stageIndex(a.record) || timestamp(b.record['更新时间']) - timestamp(a.record['更新时间']))[0];
    const targetIndex = stageIndex(workflowRecord.record);
    if (targetIndex < 0) continue;
    const patch = Object.fromEntries(
      WORKFLOW_FIELDS
        .filter((field) => hasValue(workflowRecord.record[field]))
        .map((field) => [field, scalarForWrite(workflowRecord.record[field])]),
    );
    for (const record of groupRecords) {
      if (record.id === workflowRecord.id) continue;
      if (stageIndex(record.record) >= targetIndex && !hasWorkflowDiff(record.record, patch)) continue;
      updated += 1;
      if (shouldExecute) {
        upsertRecord(source.baseToken, source.workbenchTable, patch, record.id);
      }
    }
  }
  return updated;
}

async function upsertByKey(baseToken, tableId, rows, existingByKey, shouldExecute) {
  let count = 0;
  for (const row of rows) {
    const keyField = row['废弃主键'] ? '废弃主键' : '废弃参数主键';
    const key = text(row[keyField]).toLowerCase();
    if (!key) continue;
    const existing = existingByKey.get(key);
    if (existing && hasValue(existing.record['废弃时间'])) {
      row['废弃时间'] = scalarForWrite(existing.record['废弃时间']);
    }
    if (existing) {
      for (const field of Object.keys(row)) {
        if (!hasValue(row[field]) && hasValue(existing.record[field])) {
          row[field] = scalarForWrite(existing.record[field]);
        }
      }
    }
    if (existing && !recordNeedsPatch(existing.record, row)) continue;
    if (existing && verbose) {
      console.error(JSON.stringify({ tableId, key, diff: diffFields(existing.record, row) }, null, 2));
    }
    count += 1;
    if (shouldExecute) {
      upsertRecord(baseToken, tableId, row, existing?.id);
    }
  }
  return count;
}

function batchCreate(baseToken, tableId, fields, rows) {
  if (!rows.length) return;
  for (let index = 0; index < rows.length; index += 200) {
    const chunk = rows.slice(index, index + 200);
    runCli([
      'base',
      '+record-batch-create',
      '--base-token',
      baseToken,
      '--table-id',
      tableId,
      '--json',
      JSON.stringify({
        fields,
        rows: chunk.map((row) => fields.map((field) => row[field] ?? null)),
      }),
      '--as',
      'user',
      '--format',
      'json',
    ]);
  }
}

function upsertRecord(baseToken, tableId, record, recordId = '') {
  runCli([
    'base',
    '+record-upsert',
    '--base-token',
    baseToken,
    '--table-id',
    tableId,
    '--json',
    JSON.stringify(record),
    ...(recordId ? ['--record-id', recordId] : []),
    '--as',
    'user',
    '--format',
    'json',
  ]);
}

function deleteRecords(baseToken, tableId, recordIds) {
  const ids = unique(recordIds);
  for (let index = 0; index < ids.length; index += 200) {
    const chunk = ids.slice(index, index + 200);
    if (!chunk.length) continue;
    runCli([
      'base',
      '+record-delete',
      '--base-token',
      baseToken,
      '--table-id',
      tableId,
      '--json',
      JSON.stringify({ record_id_list: chunk }),
      '--yes',
      '--as',
      'user',
      '--format',
      'json',
    ]);
  }
}

function runCli(args) {
  const output = execFileSync(CLI, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 20,
  });
  const parsed = JSON.parse(output);
  if (!parsed.ok) {
    throw new Error(JSON.stringify(parsed.error || parsed));
  }
  return parsed;
}

function parseEnumEntries(evtId, paramName, enumText) {
  const raw = String(enumText || '').trim();
  if (!raw) return [];
  const parts = raw.includes('\n')
    ? raw.replace(/\r/g, '\n').split('\n')
    : raw.includes('//')
      ? [raw]
      : raw.split(/[,，、/|]+/);
  return unique(parts.map((item) => item.trim()).filter(Boolean))
    .map(parseEnumItem)
    .filter((entry) => isValidEnumValue(entry.value))
    .map((entry) => ({
      key: `${evtId}.${paramName}.${entry.value}`,
      ...entry,
    }));
}

function parseEnumItem(rawItem) {
  const match = rawItem.match(/^(.+?)\s*(?:\/\/|#|：|:)\s*(.+)$/);
  if (match?.[1]) {
    const value = match[1].trim();
    const label = (match[2] || '').trim();
    return { value, label, definition: label };
  }
  return { value: rawItem.trim(), label: '', definition: '' };
}

function isValidEnumValue(value) {
  const item = String(value || '').trim();
  if (!item || ['-', '—', '无', '暂无', '待确认', '无特殊参数'].includes(item)) return false;
  return !/^\.{2,}$/.test(item) && !/^…+$/.test(item);
}

function toDeprecatedEventRow(designRecord, officialEvent) {
  const record = designRecord.record || {};
  const evtId = text(record.evt_id || officialEvent?.record.evt_id);
  if (!evtId) return null;
  return {
    废弃主键: evtId,
    evt_id: evtId,
    事件中文名: text(record['事件中文名'] || officialEvent?.record['事件中文名']),
    需求ID: text(record['需求ID']),
    需求名称: text(record['需求名称']),
    端: toMultiSelect(record['端'] || officialEvent?.record['端']),
    版本: text(record['版本'] || record['最低版本'] || officialEvent?.record['上线版本']) || '1.0.0',
    废弃原因: deprecatedReason(record, '事件标记为废弃'),
    废弃时间: text(record['稳定归档时间']) || nowString(),
    原流程阶段: text(record['流程阶段'] || officialEvent?.record['生命周期状态']),
    原正式状态: text(officialEvent?.record['状态'] || record['正式状态'] || '已废弃'),
    原工作台记录ID: designRecord.id || '',
    原正式记录ID: officialEvent?.id || '',
    事件定义: text(record['事件定义'] || officialEvent?.record['事件定义']),
    触发时机: text(record['触发时机'] || officialEvent?.record['触发时机']),
    '指标/使用场景': text(record['指标/使用场景'] || officialEvent?.record['指标/使用场景']),
  };
}

function toDeprecatedParamRow(designRecord, param, sourceTable, designParamId = '', officialParamId = '') {
  const record = param.record || {};
  const evtId = text(record.evt_id || designRecord.evt_id);
  const paramName = text(record['参数名']);
  const key = text(record['参数主键'] || record['设计参数主键'] || buildParamKey(evtId, paramName));
  if (!key || !evtId || !paramName) return null;
  return {
    废弃参数主键: key,
    evt_id: evtId,
    事件中文名: text(record['事件中文名'] || designRecord['事件中文名']),
    参数名: paramName,
    数据类型: normalizeParamType(text(record['数据类型'])),
    必传规则: normalizeRequiredRule(text(record['必传规则'])),
    条件说明: text(record['条件说明']),
    '枚举/取值范围': text(record['枚举/取值范围']),
    参数定义: text(record['参数定义']),
    版本: text(record['版本'] || designRecord['版本'] || designRecord['最低版本']) || '1.0.0',
    参数状态: '已废弃',
    事件状态: shouldMoveEventToDeprecated(designRecord) ? '已废弃' : text(designRecord['正式状态']) || '已上线',
    废弃原因: deprecatedReason(designRecord, sourceTable === '正式参数明细' ? '事件标记为废弃' : '参数标记为废弃'),
    废弃时间: text(designRecord['稳定归档时间']) || nowString(),
    原设计参数ID: designParamId,
    原正式参数ID: officialParamId,
    来源表: sourceTable,
    备注: text(record['备注'] || (text(record['默认值/示例']) ? `默认值/示例：${text(record['默认值/示例'])}` : '')),
  };
}

function isBusinessWorkbenchRecord(record) {
  const evtId = text(record.record.evt_id);
  const recordType = text(record.record['记录类型']);
  return recordType !== '模板' && recordType !== '权限配置' && recordType !== '系统权限配置' && Boolean(evtId || text(record.record['事件中文名']));
}

function isDesignParamForRecord(param, recordId, evtId) {
  const sourceRecordId = text(param.record['来源设计记录ID']);
  const linkedIds = linkIdsFromCell(param.record['关联设计']);
  const paramEvtId = text(param.record.evt_id);
  if (sourceRecordId && sourceRecordId === recordId) return true;
  if (linkedIds.includes(recordId)) return true;
  return !sourceRecordId && !linkedIds.length && evtId && paramEvtId === evtId;
}

function isOfficialParamForEvent(param, eventRecordId, evtId) {
  if (eventRecordId && linkIdsFromCell(param.record['关联事件']).includes(eventRecordId)) return true;
  return evtId && text(param.record.evt_id) === evtId;
}

function shouldMoveEventToDeprecated(record) {
  const stage = text(record['流程阶段']);
  const officialStatus = text(record['正式状态']);
  const changeType = normalizeChangeType(text(record['变更类型']));
  return stage === '已废弃' || (stage === '稳定归档' && (officialStatus === '已废弃' || changeType === '废弃'));
}

function isRemovedDesignParam(record) {
  return ['废弃', '已废弃'].includes(text(record['参数状态'])) || ['废弃', '删除'].includes(text(record['变更类型']));
}

function isFinalStage(record) {
  return ['稳定归档', '已废弃'].includes(text(record['流程阶段']));
}

function stageIndex(record) {
  return STAGE_ORDER.indexOf(text(record['流程阶段']) || '需求录入');
}

function hasWorkflowDiff(record, patch) {
  return Object.entries(patch).some(([field, value]) => text(record[field]) !== text(value));
}

function recordNeedsPatch(existing, patch) {
  return Object.entries(patch).some(([field, value]) => {
    if (field.startsWith('关联') || field === '枚举字典') {
      return !sameIds(linkIdsFromCell(existing[field]), linkIdsFromCell(value));
    }
    if (Array.isArray(existing[field]) || Array.isArray(value)) {
      return !sameIds(toMultiSelect(existing[field]), toMultiSelect(value));
    }
    return text(existing[field]) !== text(value);
  });
}

function diffFields(existing, patch) {
  return Object.fromEntries(
    Object.entries(patch)
      .filter(([field, value]) => recordNeedsPatch({ [field]: existing[field] }, { [field]: value }))
      .map(([field, value]) => [field, { existing: existing[field], incoming: value }]),
  );
}

function scalarForWrite(value) {
  if (Array.isArray(value) && value.length === 1 && (typeof value[0] === 'string' || typeof value[0] === 'number')) return String(value[0]);
  return value;
}

function text(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join('、');
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text.trim();
    if (typeof value.name === 'string') return value.name.trim();
    if (typeof value.link === 'string') return value.link.trim();
    if (typeof value.id === 'string') return value.id.trim();
  }
  return '';
}

function toMultiSelect(value) {
  if (Array.isArray(value)) return unique(value.flatMap((item) => text(item).split(/[、,，/]/)).filter(Boolean));
  return unique(text(value).split(/[、,，/]/).filter(Boolean));
}

function linkIdsFromCell(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return unique(values.map((item) => (typeof item === 'string' ? item : item?.id || '')).filter(Boolean));
}

function mergeLinks(existing, incoming) {
  return unique([...linkIdsFromCell(existing), ...linkIdsFromCell(incoming)]).map((id) => ({ id }));
}

function sameIds(a, b) {
  const left = unique(a).sort();
  const right = unique(b).sort();
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function hasValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return text(value) !== '';
}

function timestamp(value) {
  const raw = text(value);
  if (!raw) return 0;
  const parsed = Date.parse(raw.replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function deprecatedReason(record, fallback) {
  return text(record['废弃原因'] || record['发布错误'] || record['发布门禁失败原因'] || record['上线监控结论'] || record['评审意见'] || fallback);
}

function designParamKey(record) {
  return text(record['设计参数主键'] || buildParamKey(text(record.evt_id), text(record['参数名'])));
}

function officialParamKey(record) {
  return text(record['参数主键'] || buildParamKey(text(record.evt_id), text(record['参数名'])));
}

function buildParamKey(evtId, paramName) {
  return evtId && paramName ? `${evtId}.${paramName}` : '';
}

function normalizeParamType(value) {
  const raw = String(value || '').trim().toUpperCase();
  return ['STRING', 'INTEGER', 'NUMBER', 'BOOL', 'BOOLEAN', 'ARRAY', 'OBJECT', 'UNKNOWN'].includes(raw) ? raw : 'STRING';
}

function normalizeRequiredRule(value) {
  const raw = text(value);
  return ['必传', '非必传', '条件必传'].includes(raw) ? raw : '非必传';
}

function normalizeChangeType(value) {
  const raw = text(value);
  if (['删除', '废弃'].includes(raw)) return '废弃';
  if (['仅开发校验', '开发校验', '不修改正式库', '仅校验不归档'].includes(raw)) return '仅校验';
  return ['新增', '修改', '废弃', '口径调整', '仅校验'].includes(raw) ? raw : '新增';
}

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function uniqueRowsByKey(rows, keyField) {
  const map = new Map();
  for (const row of rows) {
    const key = text(row[keyField]).toLowerCase();
    if (key) map.set(key, row);
  }
  return Array.from(map.values());
}

function nowString() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}
