import { planAdminChange } from '../../client/src/pages/permissions/admin-membership';
import type { PermissionConfig } from '../../shared/api.interface';

const config: PermissionConfig = { admins: ['self', 'existing'], viewers: ['reader'], developers: ['dev'], dataScientists: [], acceptors: [] };
describe('管理员邀请和撤销', () => {
  it('批量邀请去重且保留其他角色', () => {
    const change = planAdminChange(config, 'self', ['new', 'existing', 'new', ''], []);
    expect(change.added).toEqual(['new']);
    expect(change.config).toEqual({ ...config, admins: ['self', 'existing', 'new'] });
    expect(config.admins).toEqual(['self', 'existing']);
  });
  it('撤销仅移除本次新增成员，保留之后加入的成员', () => {
    const invited = planAdminChange(config, 'self', ['new', 'existing'], []);
    const latest = { ...invited.config, admins: [...invited.config.admins, 'other-admin-added'] };
    const undo = planAdminChange(latest, 'self', invited.removed, invited.added);
    expect(undo.config.admins).toEqual(['self', 'existing', 'other-admin-added']);
  });
  it('移除与撤销移除可逆', () => {
    const removed = planAdminChange(config, 'self', [], ['existing']);
    expect(removed.removed).toEqual(['existing']);
    expect(planAdminChange(removed.config, 'self', removed.removed, removed.added).config).toEqual(config);
  });
  it('保护当前管理员和身份校验', () => {
    expect(() => planAdminChange(config, 'self', [], ['self'])).toThrow('不能移除自己');
    expect(() => planAdminChange(config, '', ['new'], [])).toThrow('未识别当前用户');
  });
});
