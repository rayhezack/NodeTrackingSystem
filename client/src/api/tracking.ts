import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { toReadableError } from './error';
import type {
  GetStageStatsResponse,
  GetMyTodosResponse,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
  CreateTrackingRecordRequest,
  CreateTrackingRecordResponse,
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
  TrackingSourceFilter,
} from '@shared/api.interface';

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
): Promise<DeleteParamResponse> {
  try {
    const response = await axiosForBackend.delete(
      `/api/tracking/params/${paramRecordId}`,
    );
    return response.data;
  } catch (error) {
    logger.error('删除参数失败', error);
    throw toReadableError(error, '参数废弃失败，请稍后重试');
  }
}
