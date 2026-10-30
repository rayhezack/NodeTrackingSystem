import type { PermissionConfig } from '@shared/api.interface';

/** Apply only this action to the latest configuration, including inverse/undo actions. */
export function planAdminChange(
  config: PermissionConfig,
  actorId: string,
  add: string[],
  remove: string[],
) {
  if (!actorId) throw new Error('未识别当前用户，不能修改权限');
  const before = [...new Set(config.admins)];
  const additions = [...new Set(add.map((id) => id.trim()).filter(Boolean))];
  const removals = new Set(remove);
  const admins = [...new Set([...before, ...additions])].filter(
    (id) => !removals.has(id),
  );
  if (!admins.includes(actorId)) throw new Error('不能移除自己的管理员权限');
  return {
    config: { ...config, admins },
    added: admins.filter((id) => !before.includes(id)),
    removed: before.filter((id) => !admins.includes(id)),
  };
}
