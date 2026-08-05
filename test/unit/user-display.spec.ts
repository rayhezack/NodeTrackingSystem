import { shouldFetchUserAvatar } from '../../client/src/components/business-ui/utils/user';

describe('人员头像补查', () => {
  it('已有姓名但缺少头像时仍应按妙搭人员 ID 补查', () => {
    expect(shouldFetchUserAvatar('1867390536304713')).toBe(true);
  });

  it('已有头像或仅有跨应用 open_id 时不应重复调用妙搭人员接口', () => {
    expect(shouldFetchUserAvatar('1867390536304713', 'https://example.com/avatar.png')).toBe(false);
    expect(shouldFetchUserAvatar('ou_dc88ea9baf066ba2f8b0b5fbcb59ca28')).toBe(false);
  });
});
