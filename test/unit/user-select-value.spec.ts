type UserSelectValueUtils = {
  getObjectUserIdsToFetch?: (value: unknown) => string[];
  resolveObjectUserValue?: (
    user: { user_id?: string; name?: string },
    accountType: 'apaas' | 'lark',
    fetchedUsers: Map<string, { id: string; name: string }>,
  ) => { id: string; name: string };
};

function loadUserSelectValueUtils(): UserSelectValueUtils {
  return require('../../client/src/components/business-ui/user-select/user-value.utils') as UserSelectValueUtils;
}

describe('人员选择器持久化值回显', () => {
  const utils = loadUserSelectValueUtils();

  it('对象模式应补查只有数字 ID、没有姓名的人员', () => {
    expect(typeof utils.getObjectUserIdsToFetch).toBe('function');
    if (!utils.getObjectUserIdsToFetch) return;

    expect(
      utils.getObjectUserIdsToFetch([
        { user_id: '1867390536304713' },
        { user_id: '1867390536304714', name: '已有姓名' },
        { user_id: 'ou_sunwen' },
      ]),
    ).toEqual(['1867390536304713']);
  });

  it('对象模式应使用补查到的真实姓名替换未知用户', () => {
    expect(typeof utils.resolveObjectUserValue).toBe('function');
    if (!utils.resolveObjectUserValue) return;

    const fetchedUsers = new Map([
      [
        '1867390536304713',
        { id: '1867390536304713', name: '孙文' },
      ],
    ]);

    expect(
      utils.resolveObjectUserValue(
        { user_id: '1867390536304713' },
        'apaas',
        fetchedUsers,
      ),
    ).toMatchObject({
      id: '1867390536304713',
      name: '孙文',
    });
  });
});
