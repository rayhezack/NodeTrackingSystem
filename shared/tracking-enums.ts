export class TrackingEnumError extends Error { constructor(message: string) { super(message); this.name = 'TrackingEnumError'; } }
/** Exact enum values are identifiers: preserve case, spaces and slash characters. */
export interface EnumEntry { value: string; label: string; definition: string }
export interface EnumRecord { id: string; record: Record<string, unknown> }
export function enumText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(enumText).filter(Boolean).join('、');
  return typeof value === 'object' ? enumText((value as Record<string, unknown>).text || (value as Record<string, unknown>).name) : String(value).trim();
}
export function enumLinkIds(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).map((item) => typeof item === 'string' ? item : enumText(item?.id)).filter(Boolean);
}
export function enumIdentity(evtId: string, paramName: string, value: string): string {
  return JSON.stringify([evtId.trim(), paramName.trim(), value.trim()]);
}
const EMPTY_RANGES = new Set(['-', '—', '无', '暂无', '无特殊参数']);
const OMITTED_RANGE = /^(?:\.{2,}|…+|\d+\.[。…]+)$/;
const NUMBER_VALUE = /^-?\d+(?:\.\d+)?$/;
/** A range description is metadata, never a value to insert into the enum dictionary. */
export function isDynamicRangeDescription(value: string): boolean {
  if (/^(?:同|透传|自由|任意|待确认|待人工确认|如[：:]|例如|默认URL|当前|本次|固定\s*\d)/i.test(value)
    || /^(?:https?:\/\/|visit https?:\/\/)/i.test(value)) return true;
  // An explicit code-to-label annotation is not prose merely because its label says ID/说明/时长.
  if (/^[A-Za-z0-9_./-]+\s*(?:\/\/|#|：|:|[（(]|\t| {2,})/.test(value)) return false;
  return /[\u4e00-\u9fff]/.test(value) && /(?:\b[Ii][Dd]\b|[Ii][Dd]$|标识|字符串|编号|取值|说明|不设.*枚举|素材数量|时长|功能code|不另造.*枚举)/.test(value)
    || /^[A-Za-z].{30,}[.!?](?:\s|$)/.test(value);
}
/** Numeric samples with omissions describe an open range, not exhaustive enum values. */
export function isOpenNumericRange(input: string): boolean {
  const parts = input.trim().split(/[\n\r,，、]+/).map((item) => item.trim()).filter(Boolean);
  return parts.some((item) => OMITTED_RANGE.test(item)) && parts.some((item) => NUMBER_VALUE.test(item))
    && parts.every((item) => OMITTED_RANGE.test(item) || NUMBER_VALUE.test(item));
}
export interface ParsedTrackingRange { entries: EnumEntry[]; parts: string[]; openNumeric: boolean }
export function parseTrackingRange(input: string): ParsedTrackingRange {
  const raw = input.replace(/\r\n?/g, '\n').trim();
  if (!raw || EMPTY_RANGES.has(raw)) return { entries: [], parts: [], openNumeric: false };
  if (isOpenNumericRange(raw)) return { entries: [], parts: raw.split(/[\n\r,，、]+/).map((item) => item.trim()).filter(Boolean), openNumeric: true };
  const result = new Map<string, EnumEntry>();
  const output: string[] = [];
  for (const original of raw.split('\n').map((item) => item.trim()).filter(Boolean)) {
    // Check whole descriptions before splitting commas/semicolons inside explanatory prose.
    if (isDynamicRangeDescription(original)) { output.push(original); continue; }
    for (const line of original.split(/[;；]+/).map((item) => item.trim()).filter(Boolean)) {
      if (EMPTY_RANGES.has(line)) continue;
      if (OMITTED_RANGE.test(line) || isDynamicRangeDescription(line)) { output.push(line); continue; }
      const assignment = line.match(/^[A-Z][A-Z0-9_]*\s*=\s*(['"])([^'"]+)\1\s*,?$/);
      if (assignment) {
        const value = assignment[2];
        result.set(value, result.get(value) || { value, label: '', definition: '' });
        output.push(value);
        continue;
      }
      const annotation = line.match(/^(.+?)\s*(?:\/\/|#|：|:)\s*(.+)$/)
        || line.match(/^([a-zA-Z0-9_ /.-]+)[（(]([^（）()]*[\u4e00-\u9fff][^（）()]*)[）)]$/)
        || line.match(/^([a-zA-Z0-9_./-]+)(?:\t+| {2,})([\u4e00-\u9fff].+)$/);
      const label = annotation?.[2]?.trim() || '';
      if (annotation && /[:：]/.test(line) && !line.includes('//') && /^[A-Za-z][A-Za-z ]+$/.test(annotation[1].trim()) && /^[a-z][a-z0-9_]+$/.test(label)) {
        throw new TrackingEnumError(`枚举名称与机器码方向不明确，需确认：${line.slice(0, 100)}`);
      }
      // Only spaced slashes separate alternatives; literal slashes remain part of a code.
      const values = (annotation?.[1] || line).split(/[,，、]+|\s+\/\s+/).map((value) => value.trim()).filter(Boolean);
      for (const [index, value] of values.entries()) {
        if (EMPTY_RANGES.has(value)) continue;
        if (OMITTED_RANGE.test(value) || isDynamicRangeDescription(value)) { output.push(value); continue; }
        if (/\/\//.test(label) || /[（）()<>≥≤=]/.test(value)) throw new TrackingEnumError(`枚举范围需要治理，不能自动拆分：${line.slice(0, 100)}`);
        const actualLabel = index === values.length - 1 ? label : '';
        result.set(value, result.get(value) || { value, label: actualLabel, definition: actualLabel });
        output.push(value);
      }
    }
  }
  const openNumeric = output.some((part) => OMITTED_RANGE.test(part)) && result.size > 0 && [...result.keys()].every((value) => NUMBER_VALUE.test(value));
  return { entries: openNumeric ? [] : [...result.values()], parts: [...new Set(output)], openNumeric };
}
export function parseTrackingEnums(input: string): EnumEntry[] { return parseTrackingRange(input).entries; }
export function mergeTrackingEnums(...ranges: string[]): string {
  const parsed = ranges.map(parseTrackingRange);
  const numeric = parsed.filter((range) => range.openNumeric);
  if (numeric.length) {
    if (parsed.filter((range) => !range.openNumeric).some((range) => range.entries.some((entry) => !NUMBER_VALUE.test(entry.value)))) {
      throw new TrackingEnumError('数值范围与枚举口径冲突，请先确认');
    }
    // Preserve explanatory notes alongside numeric ranges without turning samples into enums.
    const notes = parsed.filter((range) => !range.openNumeric).flatMap((range) => range.parts.filter((part) => !NUMBER_VALUE.test(part)));
    return [...new Set([...numeric.flatMap((range) => range.parts), ...notes])].join('\n');
  }
  return [...new Set(parsed.flatMap((range) => range.parts))].join('\n');
}
export function dictionaryEnums(rows: EnumRecord[], evtId: string, paramName: string, paramId: string, mode: 'official' | 'design'): EnumRecord[] {
  const field = mode === 'official' ? '关联正式参数' : '关联设计参数';
  return rows.filter(({ record }) => enumText(record['枚举状态']) !== '已废弃'
    && enumText(record.evt_id) === evtId && enumText(record['参数名']) === paramName
    && enumLinkIds(record[field]).includes(paramId)
    && (mode !== 'official' || enumText(record['枚举状态']) === '正式'));
}
export function dictionaryRange(rows: EnumRecord[]): string {
  return [...new Set(rows.map(({ record }) => enumText(record['枚举值'])).filter(Boolean))].join('\n');
}
/** Legacy dictionary samples must not turn a dynamic/numeric range into a fixed enum. */
export function parameterDictionaryRange(rows: EnumRecord[], range: string): string {
  const parsed = parseTrackingRange(range);
  return parsed.openNumeric || !parsed.entries.length && parsed.parts.some(isDynamicRangeDescription) ? '' : dictionaryRange(rows);
}
export function assertDistinctParams(rows: EnumRecord[], label: string): void {
  const seen = new Set<string>();
  for (const { record } of rows) {
    const evtId = enumText(record.evt_id);
    const name = enumText(record['参数名']);
    if (!evtId || !name) throw new TrackingEnumError(`${label}缺少 evt_id 或参数名，不能归档`);
    const key = JSON.stringify([evtId, name]);
    if (seen.has(key)) throw new TrackingEnumError(`${label}存在重复参数 ${evtId}.${name}，请先治理`);
    seen.add(key);
  }
}
