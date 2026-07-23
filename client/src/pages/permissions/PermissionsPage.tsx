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
  'admins' | 'dataScientists' | 'developers' | 'acceptors' | 'viewers'
>;

const ROLE_CONFIG: Array<{
  key: RoleKey;
  label: string;
  desc: string;
}> = [
  {
    key: 'admins',
    label: '管理员',
    desc: '管理权限配置，拥有全部需求、设计、开发、验收、上线和归档权限。',
  },
  {
    key: 'dataScientists',
    label: 'DS / 数据负责人',
    desc: '可新增需求，编辑需求、埋点设计、参数、评审、验收、上线和归档节点。',
  },
  {
    key: 'developers',
    label: '研发负责人',
    desc: '可编辑埋点开发节点；具体需求也会继续兼容 Base 记录内的研发负责人字段。',
  },
  {
    key: 'acceptors',
    label: '验收人',
    desc: '可编辑数据验收节点；适合让专项验收同学参与。',
  },
  {
    key: 'viewers',
    label: '只读用户',
    desc: '可查看工作台、需求详情和正式查询库，不授予编辑权限。',
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
        actorName: actor.name,
        config,
      });
      setConfig(res.config);
      setCanManage(true);
      setInitialized(true);
      toast.success('权限配置已保存，并已同步写入 Base');
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
              配置埋点管理平台内的业务角色；飞书 Workplace 只控制入口可见，这里控制新增和编辑权限。
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
              {Array.from({ length: 5 }).map((_, index) => (
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
                        {(config[role.key] || []).length} 人
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {role.desc}
                    </p>
                  </div>
                  <UserSelect
                    multiple
                    valueType="string"
                    accountType="lark"
                    value={config[role.key] || []}
                    onChange={(value) => updateRole(role.key, value)}
                    disabled={!canManage || saving}
                    placeholder="搜索公司成员"
                    tagClosable={canManage && !saving}
                    needFullFields
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
