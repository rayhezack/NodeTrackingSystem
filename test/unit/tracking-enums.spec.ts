import { assertDistinctParams, dictionaryEnums, dictionaryRange, mergeTrackingEnums, parseTrackingEnums } from '../../shared/tracking-enums';
describe('structured enum contract', () => {
  it('deduplicates exact values while preserving meaningful case and slashes', () => {
    expect(mergeTrackingEnums('Agent\nagent\ntext/image_to_video', 'Agent\nnew')).toBe('Agent\nagent\ntext/image_to_video\nnew');
  });
  it('understands unambiguous legacy comma plus inline labels without creating glued enum values', () => {
    expect(parseTrackingEnums('director_create,TextToImage // 文本生图；AIPhotoEditor // 图片编辑')).toEqual([
      { value: 'director_create', label: '', definition: '' }, { value: 'TextToImage', label: '文本生图', definition: '文本生图' }, { value: 'AIPhotoEditor', label: '图片编辑', definition: '图片编辑' },
    ]);
  });
  it.each(['同 form_type（EntryCodeType），如 TextToVideo', '任意字符串', '...'])('rejects an ambiguous description instead of inventing enum values: %s', (value) => {
    expect(() => parseTrackingEnums(value)).toThrow('需要治理');
  });
  it('uses only active dictionary rows linked to the actual formal parameter', () => {
    const rows = [
      { id: 'a', record: { evt_id: 'event', 参数名: 'mode', 枚举值: 'value', 枚举状态: '正式', 关联正式参数: ['p'] } },
      { id: 'b', record: { evt_id: 'event', 参数名: 'mode', 枚举值: 'unlinked', 枚举状态: '正式' } },
      { id: 'c', record: { evt_id: 'event', 参数名: 'mode', 枚举值: 'old', 枚举状态: '已废弃', 关联正式参数: ['p'] } },
    ];
    expect(dictionaryRange(dictionaryEnums(rows, 'event', 'mode', 'p', 'official'))).toBe('value');
  });
  it('refuses ambiguous parameter selection even when one duplicate is pending governance', () => {
    expect(() => assertDistinctParams([{ id: 'a', record: { evt_id: 'event', 参数名: 'mode', 参数状态: '正式' } }, { id: 'b', record: { evt_id: 'event', 参数名: 'mode', 参数状态: '待治理' } }], '正式库')).toThrow('重复参数');
  });
});
