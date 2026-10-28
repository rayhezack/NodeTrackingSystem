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
export function parseTrackingEnums(input: string): EnumEntry[] {
  const raw = input.replace(/\r\n?/g, '\n').trim();
  if (!raw || ['-', '—', '无', '暂无', '无特殊参数'].includes(raw)) return [];
  const lines = raw.split(/[\n;；]+/);
  const result = new Map<string, EnumEntry>();
  for (const line of lines.map((item) => item.trim()).filter(Boolean)) {
    const parts = line.match(/^(.+?)\s*(?:\/\/|#|：|:)\s*(.+)$/);
    const label = parts?.[2]?.trim() || '';
    if (parts && /[:：]/.test(line) && !line.includes('//') && /^[A-Za-z][A-Za-z ]+$/.test(parts[1].trim()) && /^[a-z][a-z0-9_]+$/.test(label)) {
      throw new TrackingEnumError(`枚举名称与机器码方向不明确，需确认：${line.slice(0, 100)}`);
    }
    const values = (parts?.[1] || line).split(/[,，、]+/).map((value) => value.trim()).filter(Boolean);
    for (const [index, value] of values.entries()) {
      if (/\/\//.test(label) || /^(同|自由|任意|待确认|待人工确认|如[：:]|默认URL|当前|本次)/i.test(value)
        || /[\u4e00-\u9fff]/.test(value) && /[Ii][Dd]|标识|字符串|编号|取值|说明/.test(value)
        || /^\.{2,}$|^…+$/.test(value) || /[（）()<>≥≤=]/.test(value)) {
        throw new TrackingEnumError(`枚举范围需要治理，不能自动拆分：${line.slice(0, 100)}`);
      }
      const actualLabel = index === values.length - 1 ? label : '';
      result.set(value, result.get(value) || { value, label: actualLabel, definition: actualLabel });
    }
  }
  return [...result.values()];
}
export function mergeTrackingEnums(...ranges: string[]): string {
  const values = new Set(ranges.flatMap((range) => parseTrackingEnums(range).map((entry) => entry.value)));
  return [...values].join('\n');
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
