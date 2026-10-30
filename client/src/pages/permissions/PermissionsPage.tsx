import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'framer-motion';
import { toast } from 'sonner';
import { useCurrentUser } from '@client/src/hooks/use-current-user';
import { Button } from '@client/src/components/ui/button';
import { Skeleton } from '@client/src/components/ui/skeleton';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@client/src/components/ui/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@client/src/components/ui/popover';
import {
  UserSelect,
  type UserValue,
} from '@client/src/components/business-ui/user-select';
import { useUserValue } from '@client/src/components/business-ui/user-select/use-user-value';
import { getCurrentActor } from '@client/src/utils/current-user';
import {
  getPermissionConfig,
  updatePermissionConfig,
} from '@client/src/api/tracking';
import type { PermissionConfig } from '@shared/api.interface';
import { planAdminChange } from './admin-membership';

const emptyConfig: PermissionConfig = {
  admins: [],
  dataScientists: [],
  developers: [],
  acceptors: [],
  viewers: [],
};
type MembershipChange = { added: string[]; removed: string[] };

export default function PermissionsPage() {
  const actor = getCurrentActor(useCurrentUser());
  const [config, setConfig] = useState<PermissionConfig>(emptyConfig);
  const [canManage, setCanManage] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [lastChange, setLastChange] = useState<MembershipChange | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const { internalValue } = useUserValue(config.admins, true);
  const members = Array.isArray(internalValue) ? internalValue : [];
  const [knownUsers, setKnownUsers] = useState<Record<string, UserValue>>({});

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPermissionConfig(actor.id);
      setConfig(
        res.canManage && actor.id && !res.config.admins.length
          ? { ...res.config, admins: [actor.id] }
          : res.config,
      );
      setCanManage(res.canManage);
      setInitialized(res.initialized);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [actor.id]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const changeMembers = async (
    add: string[],
    remove: string[],
    undo = false,
  ) => {
    if (savingRef.current || !canManage) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      // Re-read before each action: undo removes only members added by this action,
      // and preserves unrelated members/roles that changed since the invitation.
      const latest = await getPermissionConfig(actor.id);
      if (!latest.canManage) setCanManage(false);
      if (!latest.canManage)
        throw new Error('你的管理员权限已变更，请刷新页面');
      const base =
        !latest.initialized && actor.id
          ? { ...latest.config, admins: [actor.id] }
          : latest.config;
      const plan = planAdminChange(base, actor.id, add, remove);
      const res = await updatePermissionConfig({
        actorId: actor.id,
        actorLarkId: actor.larkId,
        actorName: actor.name,
        config: plan.config,
      });
      setConfig(res.config);
      setInitialized(true);
      if (undo) {
        setPendingIds(lastChange?.added || []);
        setLastChange(null);
        toast.success('已撤销权限变更');
      } else {
        setPendingIds([]);
        setLastChange(
          plan.added.length || plan.removed.length
            ? { added: plan.added, removed: plan.removed }
            : null,
        );
        toast.success(
          plan.added.length
            ? `已添加 ${plan.added.length} 位管理员`
            : '权限已更新',
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '权限更新失败，请重试';
      setError(message);
      toast.error(message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const remember = (users: UserValue[]) =>
    setKnownUsers((current) => ({
      ...current,
      ...Object.fromEntries(users.map((user) => [user.id, user])),
    }));
  const memberFor = (member: UserValue) =>
    member.name === '未知用户' ? knownUsers[member.id] || member : member;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" />
          权限配置
        </h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadConfig}
          disabled={loading || saving}
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {loading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : (
        <LayoutGroup id="admin-invitation">
          <section
            aria-labelledby="admin-members-heading"
            className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          >
            <h2 id="admin-members-heading" className="text-base font-semibold">
              管理员
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              受邀成员可管理所有需求和权限。
            </p>
            {!initialized && canManage && (
              <p className="mt-3 text-xs text-warning">
                首次邀请后将初始化权限配置，并保留你的管理员权限。
              </p>
            )}
            <Popover open={membersOpen} onOpenChange={setMembersOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="my-5 flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`查看 ${config.admins.length} 位管理员`}
                >
                  <span className="flex -space-x-2">
                    <AnimatePresence initial={false}>
                      {members.slice(0, 8).map((member) => {
                        const user = memberFor(member);
                        return (
                          <motion.span
                            key={user.id}
                            layoutId={
                              reduceMotion
                                ? undefined
                                : `member-avatar-${user.id}`
                            }
                            initial={
                              reduceMotion ? false : { opacity: 0, scale: 0.8 }
                            }
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={
                              reduceMotion
                                ? { duration: 0 }
                                : {
                                    type: 'spring',
                                    stiffness: 380,
                                    damping: 32,
                                  }
                            }
                            className="rounded-full ring-2 ring-card"
                            title={user.name}
                          >
                            <MemberAvatar user={user} />
                          </motion.span>
                        );
                      })}
                    </AnimatePresence>
                    {config.admins.length > 8 && (
                      <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs ring-2 ring-card">
                        +{config.admins.length - 8}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                    {config.admins.length} 位成员
                    <ChevronDown className="h-3.5 w-3.5" />
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-80 max-w-[calc(100vw-2rem)] p-2"
              >
                <h3 className="px-2 py-2 text-sm font-medium">
                  管理员 · {config.admins.length}
                </h3>
                <div className="max-h-72 overflow-y-auto">
                  {members.map((member) => {
                    const user = memberFor(member);
                    return (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 rounded-lg px-2 py-2"
                      >
                        <MemberAvatar user={user} />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {user.name}
                          {user.id === actor.id && (
                            <span className="ml-1 text-muted-foreground">
                              （你）
                            </span>
                          )}
                        </span>
                        {canManage && user.id !== actor.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            aria-label={`移除管理员${user.name}`}
                            onClick={() => void changeMembers([], [user.id])}
                          >
                            移除
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {canManage ? (
              <>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                  <UserSelect
                    multiple
                    valueType="string"
                    accountType="apaas"
                    value={pendingIds}
                    disabled={saving}
                    className="min-w-0 flex-1"
                    triggerType="custom"
                    onChange={(ids) => {
                      setPendingIds(
                        ids.filter((id) => !config.admins.includes(id)),
                      );
                      setLastChange(null);
                    }}
                    getOptionDisabled={(user) =>
                      config.admins.includes(user.id)
                    }
                    onSelect={(user) => remember([user])}
                    includeExternalContacts={false}
                    renderTrigger={({ selectedValue, open }) => {
                      const selected = Array.isArray(selectedValue)
                        ? selectedValue
                        : [];
                      return (
                        <div
                          className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-2 ${saving ? 'opacity-60' : ''}`}
                        >
                          {selected.map((user) => (
                            <span
                              key={user.id}
                              className="flex min-w-0 items-center gap-1 rounded-full bg-muted py-0.5 pl-0.5 pr-1"
                            >
                              <motion.span
                                layoutId={
                                  reduceMotion
                                    ? undefined
                                    : `member-avatar-${user.id}`
                                }
                                transition={
                                  reduceMotion
                                    ? { duration: 0 }
                                    : {
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 32,
                                      }
                                }
                              >
                                <MemberAvatar
                                  user={knownUsers[user.id] || user}
                                  small
                                />
                              </motion.span>
                              <span className="max-w-32 truncate text-xs">
                                {knownUsers[user.id]?.name || user.name}
                              </span>
                              <button
                                type="button"
                                disabled={saving}
                                className="rounded-full p-1 hover:bg-border focus-visible:ring-2 focus-visible:ring-primary"
                                aria-label={`取消邀请${user.name}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPendingIds((ids) =>
                                    ids.filter((id) => id !== user.id),
                                  );
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <button
                            type="button"
                            disabled={saving}
                            aria-haspopup="dialog"
                            aria-expanded={open}
                            aria-label="选择邀请成员"
                            className="min-w-20 flex-1 rounded py-1 text-left text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {selected.length ? '添加成员…' : '搜索公司成员…'}
                          </button>
                        </div>
                      );
                    }}
                  />
                  <Button
                    className="h-11 shrink-0 px-6"
                    disabled={saving || (!pendingIds.length && initialized)}
                    onClick={() => void changeMembers(pendingIds, [])}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : lastChange?.added.length ? (
                      <Check className="h-4 w-4" />
                    ) : null}
                    {saving
                      ? '更新中…'
                      : lastChange?.added.length
                        ? '已邀请'
                        : initialized
                          ? '邀请'
                          : pendingIds.length
                            ? '邀请并初始化'
                            : '初始化权限'}
                  </Button>
                </div>
                {lastChange && (
                  <div
                    role="status"
                    className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"
                  >
                    <span>
                      {lastChange.added.length
                        ? `已添加 ${lastChange.added.length} 位管理员`
                        : '已移除管理员'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() =>
                        void changeMembers(
                          lastChange.removed,
                          lastChange.added,
                          true,
                        )
                      }
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      撤销
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                仅管理员可邀请和移除成员。
              </p>
            )}
          </section>
        </LayoutGroup>
      )}
      <section className="px-1">
        <h2 className="text-sm font-medium">公司成员</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          登录即可查看和提交需求。研发、数据和验收权限在各需求内按参与角色分配。
        </p>
      </section>
    </div>
  );
}

function MemberAvatar({
  user,
  small = false,
}: {
  user: UserValue;
  small?: boolean;
}) {
  return (
    <Avatar className={small ? 'size-6' : 'size-8'}>
      <AvatarImage src={user.avatar} alt="" />
      <AvatarFallback className="bg-primary/10 text-xs text-primary">
        {user.name.slice(0, 1) || '?'}
      </AvatarFallback>
    </Avatar>
  );
}
