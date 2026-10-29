import { assertDistinctParams, dictionaryEnums, dictionaryRange, mergeTrackingEnums, parseTrackingEnums } from '../../shared/tracking-enums';
describe('structured enum contract', () => {
  it('deduplicates exact values while preserving meaningful case and slashes', () => {
    expect(mergeTrackingEnums('Agent\nagent\ntext/image_to_video', 'Agent\nnew')).toBe('Agent\nagent\ntext/image_to_video\nnew');
  });
  it('keeps open numeric ranges as ranges without registering partial samples or ellipses as enum values', () => {
    expect(parseTrackingEnums('1\n2\n...')).toEqual([]);
    expect(mergeTrackingEnums('1\n2\n...', '1,2,...')).toBe('1\n2\n...');
    expect(() => mergeTrackingEnums('1\n2\n...', 'home')).toThrow('口径冲突');
    expect(parseTrackingEnums('home\n...').map((entry) => entry.value)).toEqual(['home']);
  });
  it('understands unambiguous legacy comma plus inline labels without creating glued enum values', () => {
    expect(parseTrackingEnums('director_create,TextToImage // 文本生图；AIPhotoEditor // 图片编辑')).toEqual([
      { value: 'director_create', label: '', definition: '' }, { value: 'TextToImage', label: '文本生图', definition: '文本生图' }, { value: 'AIPhotoEditor', label: '图片编辑', definition: '图片编辑' },
    ]);
  });
  it.each(['同创作流id', '创作流程 ID', '同 form_type（EntryCodeType），如 TextToVideo', '任意字符串', '自由文本，不设枚举', '上传的素材数量', '停留时长秒', '功能code', '默认URL', '固定 4（对齐 server VARIANT_IMAGE_DEFAULT_CREDIT）', '...', '....', '......'])('preserves dynamic range text without registering it as an enum: %s', (value) => {
    expect(parseTrackingEnums(value)).toEqual([]);
    expect(mergeTrackingEnums(value, value)).toBe(value);
  });
  it('merges known values in open lists, skips placeholders, and retains descriptions', () => {
    expect(mergeTrackingEnums('同创作流id', '-')).toBe('同创作流id');
    expect(mergeTrackingEnums('home\n...\npollo_motion', '-,home,new')).toBe('home\n...\npollo_motion\nnew');
    expect(parseTrackingEnums('-,upgrade,pro,.......').map((entry) => entry.value)).toEqual(['upgrade', 'pro']);
    expect(parseTrackingEnums('1\n2\n3\n4\n...\n4.。。')).toEqual([]);
    expect(mergeTrackingEnums('1\n2\n...', '3')).toBe('1\n2\n...');
    expect(parseTrackingEnums(mergeTrackingEnums('1,2,...', '1,2,3,...', '上传的素材数量'))).toEqual([]);
  });
  it('extracts machine codes from parenthetical and tab-separated labels without splitting literal slashes', () => {
    expect(parseTrackingEnums('none / draft（上次未发送的草稿）\ntemplate（首页模板卡片带入）\nprompt_chip').map((entry) => entry.value)).toEqual(['none', 'draft', 'template', 'prompt_chip']);
    expect(parseTrackingEnums('video_preview   点击视频区域进行预览或查看\nanalyze\t点击视频分析').map((entry) => entry.value)).toEqual(['video_preview', 'analyze']);
    expect(parseTrackingEnums('text/image_to_video')[0].value).toBe('text/image_to_video');
    expect(parseTrackingEnums('elapsed // 停留时长说明')[0]).toEqual({ value: 'elapsed', label: '停留时长说明', definition: '停留时长说明' });
  });
  it('does not split free-text error messages or URLs into dictionary entries', () => {
    const range = 'This customer has no attached payment source or default payment method. Please consider adding a default payment method. For more information\nvisit https://stripe.com/docs/billing/subscriptions/payment-methods-setting#payment-method-priority.';
    expect(parseTrackingEnums(range)).toEqual([]);
    expect(mergeTrackingEnums(range, '-')).toBe(range);
  });
  it('still rejects unresolved machine-code mappings and malformed enum expressions', () => {
    expect(() => parseTrackingEnums('home // 首页 // other')).toThrow('需要治理');
    expect(() => parseTrackingEnums('mode(value)')).toThrow('需要治理');
  });
  it('requires confirmation for display-name to machine-code mappings while accepting value-to-Chinese-label annotations', () => {
    expect(() => parseTrackingEnums('AI Photo Editor：ai_photo_editor')).toThrow('方向不明确');
    expect(parseTrackingEnums('detail：详情页')[0].value).toBe('detail');
  });
  it('reads quoted TypeScript enum assignments as machine values and keeps forwarded ranges as descriptions', () => {
    expect(parseTrackingEnums("EMPTY = 'empty',\nPARTIAL = 'partial',\nREADY = 'ready',").map((entry) => entry.value)).toEqual(['empty', 'partial', 'ready']);
    expect(parseTrackingEnums('透传 form_type（EntryCodeType）')).toEqual([]);
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
