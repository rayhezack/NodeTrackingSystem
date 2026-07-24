import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Loader2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Skeleton } from '@client/src/components/ui/skeleton';
import { UserSelect } from '@client/src/components/business-ui/user-select';
import { getCurrentActor } from '@client/src/utils/current-user';
import {
  getPermissionConfig,
  updatePermissionConfig,
} from '@client/src/api/tracking';
import type { PermissionConfig } from '@shared/api.interface';

type RoleKey = keyof Pick<
  PermissionConfig,
  'admins' | 'viewers'
>;

const ROLE_CONFIG: Array<{
  key: RoleKey;
  label: string;
  desc: string;
  editable: boolean;
}> = [
  {
    key: 'admins',
    label: '管理员',
    desc: '管理权限配置，并拥有所有需求、设计、开发、验收、上线和归档权限。',
    editable: true,
  },
  {
    key: 'viewers',
    label: '普通用户',
    desc: '由飞书 Workplace 的应用可见范围自动决定：能进入应用且可被识别的内部成员，都可查看并自由提交新需求。',
    editable: false,
  },
];

const emptyConfig: PermissionConfig = {
  admins: [],
  dataScientists: [],
  developers: [],
  acceptors: [],
  viewers: [],
};

export default function PermissionsPage() {
  const userProfile = useCurrentUserProfile();
  const actor = getCurrentActor(userProfile);
  const [config, setConfig] = useState<PermissionConfig>(emptyConfig);
  const [canManage, setCanManage] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPermissionConfig(actor.id);
      setConfig(
        res.canManage && actor.id && res.config.admins.length === 0
          ? { ...res.config, admins: [actor.id] }
          : res.config,
      );
      setCanManage(res.canManage);
      setInitialized(res.initialized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [actor.id]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const updateRole = (key: RoleKey, value: string[]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!actor.id) {
      toast.error('未识别当前用户，不能保存权限配置');
      return;
    }
    if (!config.admins.includes(actor.id)) {
      toast.error('管理员列表必须包含当前用户，避免保存后失去管理权限');
      return;
    }

    setSaving(true);
    try {
      const res = await updatePermissionConfig({
        actorId: actor.id,
        actorLarkId: actor.larkId,
        actorName: actor.name,
        config: {
          ...config,
          viewers: [],
          dataScientists: [],
          developers: [],
          acceptors: [],
        },
      });
      setConfig(res.config);
      setCanManage(true);
      setInitialized(true);
      toast.success('权限配置已保存；项目角色权限将跟随具体需求生效');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              权限配置
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              全局权限只配置管理员和普通用户；数据负责人、研发负责人、DS 验收人等项目角色在每条需求中指定。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={loadConfig}
              disabled={loading || saving}
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-sm"
              onClick={handleSave}
              disabled={!canManage || loading || saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存配置
            </Button>
          </div>
        </div>

        {!initialized && !loading && canManage && (
          <div className="mb-4 rounded-sm border border-[hsl(38_92%_82%)] bg-[hsl(38_92%_96%)] px-3 py-2 text-xs text-[hsl(38_92%_35%)]">
            当前还没有初始化权限配置。首次保存后，你会自动成为管理员，后续只有管理员可以修改这里。
          </div>
        )}

        {!canManage && !loading && (
          <div className="mb-4 rounded-sm border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            当前用户没有权限管理权限，仅可查看现有配置。
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            权限配置加载失败：{error}
          </div>
        )}

        <div className="rounded-sm border border-border bg-card">
          {loading ? (
            <div className="space-y-4 p-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-28 rounded-sm" />
                  <Skeleton className="h-8 w-full rounded-sm" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {ROLE_CONFIG.map((role) => (
                <div
                  key={role.key}
                  className="grid gap-3 p-4 lg:grid-cols-[220px_1fr]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-medium text-foreground">{role.label}</h2>
                      <Badge variant="outline" className="h-5 rounded-sm text-[10px]">
                        {role.editable ? `${(config[role.key] || []).length} 人` : '自动'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {role.desc}
                    </p>
                  </div>
                  {role.editable ? (
                    <UserSelect
                      multiple
                      valueType="string"
                      accountType="apaas"
                      value={config[role.key] || []}
                      onChange={(value) => updateRole(role.key, value)}
                      disabled={!canManage || saving}
                      placeholder="搜索公司内部成员"
                      tagClosable={canManage && !saving}
                      needFullFields
                      includeExternalContacts={false}
                    />
                  ) : (
                    <div className="rounded-sm border border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
                      普通用户无需逐个添加；如需限制哪些同事能进入应用，请在飞书 Workplace / 妙搭应用发布范围中调整。
                      被加入某条需求的提需人、录入人、数据负责人、研发负责人或 DS 验收人，会自动获得对应项目节点权限。
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
