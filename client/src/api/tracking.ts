import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  GetStageStatsResponse,
  GetMyTodosResponse,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
  GetTrackingDetailResponse,
  UpdateTrackingRecordRequest,
  UpdateTrackingRecordResponse,
  GetParamsResponse,
  CreateParamRequest,
  CreateParamResponse,
  UpdateParamRequest,
  UpdateParamResponse,
  DeleteParamResponse,
} from '@shared/api.interface';

export async function getStageStats(): Promise<GetStageStatsResponse> {
  try {
    const response = await axiosForBackend.get('/api/tracking/stats');
    return response.data;
  } catch (error) {
    logger.error('获取阶段统计失败', error);
    throw error;
  }
}

export async function getMyTodos(limit = 10): Promise<GetMyTodosResponse> {
  try {
    const response = await axiosForBackend.get('/api/tracking/my-todos', {
      params: { limit },
    });
    return response.data;
  } catch (error) {
    logger.error('获取我的待办失败', error);
    throw error;
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
    throw error;
  }
}

export async function getTrackingDetail(
  recordId: string,
): Promise<GetTrackingDetailResponse> {
  try {
    const response = await axiosForBackend.get(
      `/api/tracking/records/${recordId}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取需求详情失败', error);
    throw error;
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
    throw error;
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
    throw error;
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
    throw error;
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
    throw error;
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
    throw error;
  }
}
