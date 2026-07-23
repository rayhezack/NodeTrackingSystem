import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { toReadableError } from './error';
import type {
  GetOfficialEventsParams,
  GetOfficialEventsResponse,
  GetOfficialParamsResponse,
} from '@shared/api.interface';

export async function getOfficialEvents(
  params: GetOfficialEventsParams = {},
): Promise<GetOfficialEventsResponse> {
  try {
    const response = await axiosForBackend.get('/api/query-library/events', {
      params,
    });
    return response.data;
  } catch (error) {
    logger.error('获取正式事件列表失败', error);
    throw toReadableError(error, '正式查询库读取失败，请检查 Base 权限');
  }
}

export async function getOfficialParams(
  recordId: string,
): Promise<GetOfficialParamsResponse> {
  try {
    const response = await axiosForBackend.get(
      `/api/query-library/events/${recordId}/params`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取正式参数明细失败', error);
    throw toReadableError(error, '正式参数明细读取失败，请检查 Base 权限');
  }
}
