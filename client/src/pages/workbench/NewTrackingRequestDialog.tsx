import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Switch } from '@client/src/components/ui/switch';
import { UserSelect } from '@client/src/components/business-ui/user-select';
import type {
  CreateParamRequest,
  CreateTrackingRecordRequest,
  TrackingSource,
  TrackingUserRef,
} from '@shared/api.interface';

interface NewTrackingRequestDialogProps {
  open: boolean;
  actorId?: string;
  actorLarkId?: string;
  actorName?: string;
  onClose: () => void;
  onSubmit: (data: CreateTrackingRecordRequest) => Promise<void>;
}

interface DraftParam {
  paramKey: string;
  paramName: string;
  paramType: string;
  required: boolean;
  definition: string;
  example: string;
}

interface ParticipantForm {
  requesterIds: TrackingUserRef[];
  recorderIds: TrackingUserRef[];
  dataOwnerIds: TrackingUserRef[];
  devOwnerIds: TrackingUserRef[];
  dsAcceptorIds: TrackingUserRef[];
}

const emptyParam = (): DraftParam => ({
  paramKey: '',
  paramName: '',
  paramType: 'STRING',
  required: false,
  definition: '',
  example: '',
});

const WEB_COMMON_PROPS =
  'user_id、anonymous_id、session_id、url、referrer、utm_source、browser、os';
const APP_COMMON_PROPS = 'user_id、device_id、app_version、platform';
const APP_HANDLER_OPTIONS = ['客户端', '客户端/服务端'];
const WEB_HANDLER_OPTIONS = ['前端', '服务端', '前端/服务端'];

const getSourceByPlatform = (platform: string): TrackingSource =>
  platform === 'Web' ? 'web' : 'app';

const defaultForm = () => ({
  source: 'app' as TrackingSource,
  evtId: '',
  eventName: '',
  priority: 'P2',
  platform: 'iOS、Android',
  requirementBackground: '',
  metricScenario: '',
  eventDefinition: '',
  triggerTiming: '',
  handler: '客户端',
  commonProps: APP_COMMON_PROPS,
  version: '1.0.0',
  minVersion: '1.0.0',
  changeType: '新增',
});

const defaultParticipants = (
  actorId?: string,
  actorName?: string,
): ParticipantForm => {
  const currentUser = actorId
    ? [{
        user_id: actorId,
        name: actorName || '当前用户',
      }]
    : [];
  return {
    requesterIds: [],
    recorderIds: currentUser,
    dataOwnerIds: currentUser,
    devOwnerIds: [],
    dsAcceptorIds: currentUser,
  };
};

export default function NewTrackingRequestDialog({
  open,
  actorId,
  actorLarkId,
  actorName,
  onClose,
  onSubmit,
}: NewTrackingRequestDialogProps) {
  const [form, setForm] = useState(defaultForm);
  const [participants, setParticipants] = useState<ParticipantForm>(() =>
    defaultParticipants(actorId, actorName),
  );
  const [params, setParams] = useState<DraftParam[]>([emptyParam()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(defaultForm());
    setParticipants(defaultParticipants(actorId, actorName));
    setParams([emptyParam()]);
  }, [open, actorId, actorName]);

  const updateField = (key: keyof ReturnType<typeof defaultForm>, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePlatformChange = (platform: string) => {
    const source = getSourceByPlatform(platform);
    setForm((prev) => ({
      ...prev,
      source,
      platform,
      handler: normalizeHandlerBySource(prev.handler, source),
      commonProps:
        source === 'web'
          ? WEB_COMMON_PROPS
          : prev.commonProps === WEB_COMMON_PROPS
            ? APP_COMMON_PROPS
            : prev.commonProps,
    }));
  };

  const updateParticipants = (key: keyof ParticipantForm, value: TrackingUserRef[]) => {
    setParticipants((prev) => ({ ...prev, [key]: value }));
  };

  const updateParam = <K extends keyof DraftParam>(
    index: number,
    key: K,
    value: DraftParam[K],
  ) => {
    setParams((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)),
    );
  };

  const handleSubmit = async () => {
    if (!form.evtId.trim()) {
      toast.error('请输入 evt_id');
      return;
    }
    if (!form.eventName.trim()) {
      toast.error('请输入事件名');
      return;
    }
    if (!actorId) {
      toast.error('未识别当前用户，无法创建需求');
      return;
    }
    if (!participants.requesterIds.length) {
      toast.error('请填写需求提出人');
      return;
    }
    if (!participants.recorderIds.length) {
      toast.error('请填写需求录入人');
      return;
    }
    if (!participants.dataOwnerIds.length) {
      toast.error('请填写数据负责人');
      return;
    }
    if (!participants.devOwnerIds.length) {
      toast.error('请填写研发负责人');
      return;
    }
    if (!participants.dsAcceptorIds.length) {
      toast.error('请填写 DS 验收人');
      return;
    }

    const initialParams: CreateParamRequest[] = params
      .filter((item) => item.paramKey.trim() || item.paramName.trim())
      .map((item) => ({
        paramKey: item.paramKey.trim() || `${form.evtId.trim()}.${item.paramName.trim()}`,
        evtId: form.evtId.trim(),
        paramName: item.paramName.trim(),
        paramType: item.paramType,
        required: item.required,
        definition: item.definition.trim(),
        example: item.example.trim(),
        platform: form.source === 'web' ? 'Web通用' : 'App通用',
        status: '草稿',
        version: form.version,
        changeType: '新增',
      }));

    setSaving(true);
    try {
      await onSubmit({
        ...form,
        evtId: form.evtId.trim(),
        eventName: form.eventName.trim(),
        actorId,
        actorLarkId,
        actorName,
        requesterIds: toParticipantIds(participants.requesterIds),
        recorderIds: toParticipantIds(participants.recorderIds),
        dataOwnerIds: toParticipantIds(participants.dataOwnerIds),
        devOwnerIds: toParticipantIds(participants.devOwnerIds),
        dsAcceptorIds: toParticipantIds(participants.dsAcceptorIds),
        initialParams,
      });
      toast.success('需求已创建，并已同步写入对应 Base；相关项目成员将获得对应节点权限');
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '新增需求失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'h-8 rounded-sm text-xs';
  const textareaCls = 'rounded-sm text-xs min-h-[64px]';

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !saving && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="text-base">新增埋点需求</DialogTitle>
        </DialogHeader>

        <div className="rounded-sm border border-[hsl(217_91%_86%)] bg-[hsl(217_91%_97%)] px-3 py-2 text-xs text-muted-foreground">
          根据「端」自动写入对应 Base；项目参与人会同步写入 Base，并决定后续节点编辑权限与内部通知对象。
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
          <Field label="evt_id" required>
            <Input
              className={inputCls}
              value={form.evtId}
              onChange={(event) => updateField('evtId', event.target.value)}
              placeholder="如：video_play_click"
            />
          </Field>
          <Field label="事件名" required>
            <Input
              className={inputCls}
              value={form.eventName}
              onChange={(event) => updateField('eventName', event.target.value)}
              placeholder="如：视频播放按钮点击"
            />
          </Field>
          <Field label="优先级">
            <Select value={form.priority} onValueChange={(value) => updateField('priority', value)}>
              <SelectTrigger className={inputCls}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['P0', 'P1', 'P2'].map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="端">
            <Select
              value={form.platform}
              onValueChange={handlePlatformChange}
            >
              <SelectTrigger className={inputCls}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['iOS', 'Android', 'iOS、Android', 'App通用', 'Web'].map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2 rounded-sm border border-border bg-muted/20 p-3">
            <div className="mb-3">
              <h3 className="text-sm font-medium text-foreground">项目参与人</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                需求录入时一次性填清楚参与人：提需/录入人可维护需求信息；数据负责人和 DS 验收人可维护设计、评审、验收、上线、归档与参数；研发负责人可维护开发节点。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
              <Field label="需求提出人 / 提需人" required>
                <ProjectUserSelect
                  value={participants.requesterIds}
                  onChange={(value) => updateParticipants('requesterIds', value)}
                  disabled={saving}
                />
              </Field>
              <Field label="需求录入人" required>
                <ProjectUserSelect
                  value={participants.recorderIds}
                  onChange={(value) => updateParticipants('recorderIds', value)}
                  disabled={saving}
                />
              </Field>
              <Field label="数据负责人" required>
                <ProjectUserSelect
                  value={participants.dataOwnerIds}
                  onChange={(value) => updateParticipants('dataOwnerIds', value)}
                  disabled={saving}
                />
              </Field>
              <Field label="研发负责人" required>
                <ProjectUserSelect
                  value={participants.devOwnerIds}
                  onChange={(value) => updateParticipants('devOwnerIds', value)}
                  disabled={saving}
                />
              </Field>
              <Field label="DS 验收人" required className="md:col-span-2">
                <ProjectUserSelect
                  value={participants.dsAcceptorIds}
                  onChange={(value) => updateParticipants('dsAcceptorIds', value)}
                  disabled={saving}
                />
              </Field>
            </div>
          </div>
          <Field label="需求背景" className="md:col-span-2">
            <Textarea
              className={textareaCls}
              value={form.requirementBackground}
              onChange={(event) => updateField('requirementBackground', event.target.value)}
              placeholder="说明为什么需要这个埋点，以及要支撑什么业务判断..."
            />
          </Field>
          <Field label="指标/使用场景" className="md:col-span-2">
            <Textarea
              className={textareaCls}
              value={form.metricScenario}
              onChange={(event) => updateField('metricScenario', event.target.value)}
              placeholder="如：转化漏斗、活动 CTR、功能使用率、异常监控..."
            />
          </Field>
          <Field label="事件定义" className="md:col-span-2">
            <Textarea
              className={textareaCls}
              value={form.eventDefinition}
              onChange={(event) => updateField('eventDefinition', event.target.value)}
              placeholder="定义事件统计口径和边界..."
            />
          </Field>
          <Field label="触发时机" className="md:col-span-2">
            <Textarea
              className={textareaCls}
              value={form.triggerTiming}
              onChange={(event) => updateField('triggerTiming', event.target.value)}
              placeholder="描述前端/服务端应在什么时刻上报..."
            />
          </Field>
          <Field label="处理方">
            <Select
              value={form.handler}
              onValueChange={(value) => updateField('handler', value)}
            >
              <SelectTrigger className={inputCls}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getHandlerOptions(form.source).map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="版本">
            <Input
              className={inputCls}
              value={form.version}
              onChange={(event) => updateField('version', event.target.value)}
            />
          </Field>
          <Field label="公共属性要求" className="md:col-span-2">
            <Textarea
              className={textareaCls}
              value={form.commonProps}
              onChange={(event) => updateField('commonProps', event.target.value)}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-foreground">首批参数</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                可先录入关键参数；创建后也可以在详情页继续新增和编辑。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() => setParams((prev) => [...prev, emptyParam()])}
            >
              <Plus className="h-3.5 w-3.5" />
              增加参数
            </Button>
          </div>

          <div className="space-y-2">
            {params.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-2 rounded-sm border border-border bg-card p-3 md:grid-cols-[1fr_1fr_120px_96px_1fr_1fr_36px]"
              >
                <Input
                  className={inputCls}
                  value={item.paramKey}
                  onChange={(event) => updateParam(index, 'paramKey', event.target.value)}
                  placeholder="参数 key"
                />
                <Input
                  className={inputCls}
                  value={item.paramName}
                  onChange={(event) => updateParam(index, 'paramName', event.target.value)}
                  placeholder="参数名"
                />
                <Select
                  value={item.paramType}
                  onValueChange={(value) => updateParam(index, 'paramType', value)}
                >
                  <SelectTrigger className={inputCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['string', 'number', 'boolean', 'object', 'array'].map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex h-8 items-center gap-2">
                  <Switch
                    checked={item.required}
                    onCheckedChange={(checked) => updateParam(index, 'required', checked)}
                  />
                  <span className="text-xs text-muted-foreground">必传</span>
                </div>
                <Input
                  className={inputCls}
                  value={item.definition}
                  onChange={(event) => updateParam(index, 'definition', event.target.value)}
                  placeholder="定义"
                />
                <Input
                  className={inputCls}
                  value={item.example}
                  onChange={(event) => updateParam(index, 'example', event.target.value)}
                  placeholder="示例"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-sm"
                  disabled={params.length === 1}
                  onClick={() => setParams((prev) => prev.filter((_, idx) => idx !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </Button>
          <Button size="sm" className="h-8 rounded-sm" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? '创建中...' : '创建并进入埋点设计'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <div className="mb-1.5 text-xs text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </div>
      {children}
    </label>
  );
}

function ProjectUserSelect({
  value,
  onChange,
  disabled,
}: {
  value: TrackingUserRef[];
  onChange: (value: TrackingUserRef[]) => void;
  disabled?: boolean;
}) {
  return (
    <UserSelect
      multiple
      valueType="object"
      accountType="apaas"
      value={value}
      onChange={(nextValue) => onChange(Array.isArray(nextValue) ? toParticipantRefs(nextValue) : [])}
      disabled={disabled}
      placeholder="搜索公司内部成员"
      tagClosable={!disabled}
      needFullFields
      includeExternalContacts={false}
    />
  );
}

function toParticipantIds(value: TrackingUserRef[]): string[] {
  return uniqueStrings(
    value
      .map((item) => extractNumericUserId(item))
      .filter((id): id is string => Boolean(id)),
  );
}

function toParticipantRefs(value: unknown[]): TrackingUserRef[] {
  return value
    .map<TrackingUserRef | null>((item) => {
      if (!item || typeof item !== 'object') return null;
      const user = item as Record<string, unknown>;
      const id = extractNumericUserId(user);
      if (!id) return null;
      const larkUserId = [
        user.larkUserId,
        user.lark_user_id,
        user.lark_id,
        user.open_id,
        user.openId,
      ].find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);
      const name = user.name;
      return {
        user_id: id,
        larkUserId,
        name: typeof name === 'string' ? name : id,
      };
    })
    .filter((item): item is TrackingUserRef => Boolean(item));
}

function extractNumericUserId(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? String(value) : '';
  if (typeof value === 'string') return /^\d+$/.test(value.trim()) ? value.trim() : '';
  if (!value || typeof value !== 'object') return '';

  const user = value as Record<string, unknown>;
  for (const key of [
    'user_id',
    'userId',
    'userID',
    'miaoda_user_id',
    'miaodaUserID',
    'employee_id',
    'employeeID',
    'id',
  ]) {
    const id = extractNumericUserId(user[key]);
    if (id) return id;
  }
  return '';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function getHandlerOptions(source: TrackingSource): string[] {
  return source === 'web' ? WEB_HANDLER_OPTIONS : APP_HANDLER_OPTIONS;
}

function normalizeHandlerBySource(value: string, source: TrackingSource): string {
  const options = getHandlerOptions(source);
  return options.includes(value) ? value : options[0];
}
