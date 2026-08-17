import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { toReadableError } from './error';
import type {
  GetStageStatsResponse,
  GetMyTodosResponse,
  GetWorkbenchDashboardParams,
  GetWorkbenchDashboardResponse,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
  CreateTrackingRecordRequest,
  CreateTrackingRecordResponse,
  CreateSiblingTrackingEventRequest,
  CreateSiblingTrackingEventResponse,
  DeleteTrackingEventRequest,
  DeleteTrackingEventResponse,
  DeleteTrackingRequestRequest,
  DeleteTrackingRequestResponse,
  NotificationRuntimeStatus,
  ResolveUiImagePreviewRequest,
  ResolveUiImagePreviewResponse,
  ReuseOfficialEventRequest,
  ReuseOfficialEventResponse,
  GetPermissionConfigResponse,
  GetTrackingDetailResponse,
  UpdatePermissionConfigRequest,
  UpdatePermissionConfigResponse,
  UpdateTrackingRecordRequest,
  UpdateTrackingRecordResponse,
  GetParamsResponse,
  CreateParamRequest,
  CreateParamResponse,
  UpdateParamRequest,
  UpdateParamResponse,
  DeleteParamResponse,
  BatchDeleteParamsRequest,
  BatchDeleteParamsResponse,
  AiTrackingConfigStatus,
  AiFeishuAuthStatus,
  StartAiFeishuAuthRequest,
  StartAiFeishuAuthResponse,
  GenerateAiTrackingDraftRequest,
  GenerateAiTrackingDraftResponse,
  GetLatestAiTrackingDraftResponse,
  ApplyAiTrackingDraftRequest,
  ApplyAiTrackingDraftResponse,
  TrackingSourceFilter,
} from '@shared/api.interface';

export async function getWorkbenchDashboard(
  params: GetWorkbenchDashboardParams = {},
): Promise<GetWorkbenchDashboardResponse> {
  try {
    const response = await axiosForBackend.get('/api/tracking/dashboard', {
      params,
    });
    return response.data;
  } catch (error) {
    logger.error('获取工作台数据失败', error);
    throw toReadableError(error, '获取工作台数据失败，请检查 Base 权限');
  }
}

export async function getStageStats(
  source?: TrackingSourceFilter,
): Promise<GetStageStatsResponse> {
  try {
    const response = await axiosForBackend.get('/api/tracking/stats', {
      params: { source },
    });
    return response.data;
  } catch (error) {
    logger.error('获取阶段统计失败', error);
    throw toReadableError(error, '获取阶段统计失败，请检查 Base 权限');
  }
}

export async function getMyTodos(
  limit = 10,
  source?: TrackingSourceFilter,
  actorId?: string,
  actorLarkId?: string,
): Promise<GetMyTodosResponse> {
  try {
    const response = await axiosForBackend.get('/api/tracking/my-todos', {
      params: { limit, source, actorId, actorLarkId },
    });
    return response.data;
  } catch (error) {
    logger.error('获取我的待办失败', error);
    throw toReadableError(error, '获取我的待办失败，请检查 Base 权限');
  }
}

export async function getTrackingRecords(
  params: GetTrackingRecordsParams = {},
): Promise<GetTrackingRecordsResponse> {
  try {
    const response = await axiosForBackend.get('/api/tracking/records', {
      params,
    });
    return response.data;
  } catch (error) {
    logger.error('获取需求列表失败', error);
    throw toReadableError(error, '获取需求列表失败，请检查 Base 权限');
  }
}

export async function createTrackingRecord(
  data: CreateTrackingRecordRequest,
): Promise<CreateTrackingRecordResponse> {
  try {
    const response = await axiosForBackend.post('/api/tracking/records', data);
    return response.data;
  } catch (error) {
    logger.error('新增需求失败', error);
    throw toReadableError(error, '新增需求失败，请检查必填字段和 Base 写入权限');
  }
}

export async function getPermissionConfig(
  actorId?: string,
): Promise<GetPermissionConfigResponse> {
  try {
    const response = await axiosForBackend.get('/api/tracking/permissions', {
      params: { actorId },
    });
    return response.data;
  } catch (error) {
    logger.error('获取权限配置失败', error);
    throw toReadableError(error, '获取权限配置失败，请检查 Base 权限');
  }
}

export async function updatePermissionConfig(
  data: UpdatePermissionConfigRequest,
): Promise<UpdatePermissionConfigResponse> {
  try {
    const response = await axiosForBackend.put('/api/tracking/permissions', data);
    return response.data;
  } catch (error) {
    logger.error('更新权限配置失败', error);
    throw toReadableError(error, '更新权限配置失败，请确认你是管理员');
  }
}

export async function getTrackingDetail(
  recordId: string,
  actorId?: string,
  actorLarkId?: string,
): Promise<GetTrackingDetailResponse> {
  try {
    const response = await axiosForBackend.get(
      `/api/tracking/records/${recordId}`,
      { params: { actorId, actorLarkId } },
    );
    return response.data;
  } catch (error) {
    logger.error('获取需求详情失败', error);
    throw toReadableError(error, '获取需求详情失败，请检查 Base 权限');
  }
}

export async function resolveUiImagePreview(
  data: ResolveUiImagePreviewRequest,
): Promise<ResolveUiImagePreviewResponse> {
  try {
    const response = await axiosForBackend.post('/api/tracking/ui-image-preview', data);
    return response.data;
  } catch (error) {
    logger.error('解析 UI 图预览失败', error);
    return {
      url: '',
      reason: 'STORAGE_LOOKUP_FAILED',
    };
  }
}

export async function updateTrackingRecord(
  recordId: string,
  data: UpdateTrackingRecordRequest,
): Promise<UpdateTrackingRecordResponse> {
  try {
    const response = await axiosForBackend.patch(
      `/api/tracking/records/${recordId}`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('更新需求失败', error);
    throw toReadableError(error, '更新需求失败，请检查 Base 权限或字段类型');
  }
}

export async function createSiblingTrackingEvent(
  recordId: string,
  data: CreateSiblingTrackingEventRequest,
): Promise<CreateSiblingTrackingEventResponse> {
  try {
    const response = await axiosForBackend.post(
      `/api/tracking/records/${recordId}/events`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('新增同需求埋点事件失败', error);
    throw toReadableError(error, '新增同需求埋点事件失败，请检查 evt_id 是否重复或 Base 权限');
  }
}

export async function deleteTrackingEvent(
  recordId: string,
  data: DeleteTrackingEventRequest,
): Promise<DeleteTrackingEventResponse> {
  try {
    const response = await axiosForBackend.delete(
      `/api/tracking/records/${recordId}`,
      { data },
    );
    return response.data;
  } catch (error) {
    logger.error('删除埋点事件失败', error);
    throw toReadableError(error, '删除埋点事件失败，请确认仍处于设计阶段且至少保留一个事件');
  }
}

export async function deleteTrackingRequest(
  recordId: string,
  data: DeleteTrackingRequestRequest,
): Promise<DeleteTrackingRequestResponse> {
  try {
    const response = await axiosForBackend.delete(
      `/api/tracking/records/${recordId}/request`,
      { data },
    );
    return response.data;
  } catch (error) {
    logger.error('删除需求单失败', error);
    throw toReadableError(error, '删除需求单失败，请确认需求尚未进入正式上线/归档链路');
  }
}

export async function getNotificationStatus(): Promise<NotificationRuntimeStatus> {
  try {
    const response = await axiosForBackend.get('/api/tracking/notifications/status');
    return response.data;
  } catch (error) {
    logger.error('获取通知配置状态失败', error);
    return {
      configured: false,
      hasAppId: false,
      hasAppSecret: false,
      usingDefaultAppId: true,
    };
  }
}

export async function reuseOfficialTrackingEvent(
  recordId: string,
  data: ReuseOfficialEventRequest,
): Promise<ReuseOfficialEventResponse> {
  try {
    const response = await axiosForBackend.post(
      `/api/tracking/records/${recordId}/reuse-official-event`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('复用已有正式事件失败', error);
    throw toReadableError(error, '复用已有正式事件失败，请检查 Base 权限或当前需求内是否已有同名 evt_id');
  }
}

export async function getParams(recordId: string): Promise<GetParamsResponse> {
  try {
    const response = await axiosForBackend.get(
      `/api/tracking/records/${recordId}/params`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取参数列表失败', error);
    throw toReadableError(error, '获取参数列表失败，请检查 Base 权限');
  }
}

export async function createParam(
  recordId: string,
  data: CreateParamRequest,
): Promise<CreateParamResponse> {
  try {
    const response = await axiosForBackend.post(
      `/api/tracking/records/${recordId}/params`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('新增参数失败', error);
    throw toReadableError(error, '新增参数失败，请检查参数字段');
  }
}

export async function updateParam(
  paramRecordId: string,
  data: UpdateParamRequest,
): Promise<UpdateParamResponse> {
  try {
    const response = await axiosForBackend.put(
      `/api/tracking/params/${paramRecordId}`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('更新参数失败', error);
    throw toReadableError(error, '更新参数失败，请检查参数字段');
  }
}

export async function deleteParam(
  paramRecordId: string,
  actorId?: string,
  actorLarkId?: string,
): Promise<DeleteParamResponse> {
  try {
    const response = await axiosForBackend.delete(
      `/api/tracking/params/${paramRecordId}`,
      { params: { actorId, actorLarkId } },
    );
    return response.data;
  } catch (error) {
    logger.error('删除参数失败', error);
    throw toReadableError(error, '删除参数失败，请稍后重试');
  }
}

export async function batchDeleteParams(
  recordId: string,
  data: BatchDeleteParamsRequest,
): Promise<BatchDeleteParamsResponse> {
  try {
    const response = await axiosForBackend.post(
      `/api/tracking/records/${recordId}/params/batch-delete`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('批量删除参数失败', error);
    throw toReadableError(error, '批量删除参数失败，请确认参数仍属于当前埋点设计');
  }
}

export async function getAiTrackingConfig(): Promise<AiTrackingConfigStatus> {
  try {
    const response = await axiosForBackend.get('/api/tracking/ai/config');
    return response.data;
  } catch (error) {
    throw toReadableError(error, '无法读取 AI 配置状态');
  }
}

export async function getAiFeishuAuthStatus(
  actorId?: string,
  actorLarkId?: string,
): Promise<AiFeishuAuthStatus> {
  try {
    const response = await axiosForBackend.get('/api/tracking/ai/feishu-auth/status', {
      params: { actorId, actorLarkId },
    });
    return response.data;
  } catch (error) {
    throw toReadableError(error, '无法读取飞书文档授权状态');
  }
}

export async function startAiFeishuAuth(
  data: StartAiFeishuAuthRequest,
): Promise<StartAiFeishuAuthResponse> {
  try {
    const response = await axiosForBackend.post('/api/tracking/ai/feishu-auth/start', data);
    return response.data;
  } catch (error) {
    throw toReadableError(error, '无法发起飞书文档授权');
  }
}

export async function generateAiTrackingDraft(
  recordId: string,
  data: GenerateAiTrackingDraftRequest,
): Promise<GenerateAiTrackingDraftResponse> {
  try {
    const response = await axiosForBackend.post(
      `/api/tracking/ai/records/${recordId}/drafts`,
      data,
    );
    return response.data;
  } catch (error) {
    throw toReadableError(error, 'AI 埋点草稿生成失败');
  }
}

export async function getLatestAiTrackingDraft(
  recordId: string,
  actorId?: string,
  actorLarkId?: string,
): Promise<GetLatestAiTrackingDraftResponse> {
  try {
    const response = await axiosForBackend.get(
      `/api/tracking/ai/records/${recordId}/drafts/latest`,
      { params: { actorId, actorLarkId } },
    );
    return response.data;
  } catch (error) {
    throw toReadableError(error, '无法读取最近的 AI 埋点草稿');
  }
}

export async function applyAiTrackingDraft(
  recordId: string,
  draftId: string,
  data: ApplyAiTrackingDraftRequest,
): Promise<ApplyAiTrackingDraftResponse> {
  try {
    const response = await axiosForBackend.post(
      `/api/tracking/ai/records/${recordId}/drafts/${draftId}/apply`,
      data,
    );
    return response.data;
  } catch (error) {
    throw toReadableError(error, 'AI 埋点草稿应用失败');
  }
}
