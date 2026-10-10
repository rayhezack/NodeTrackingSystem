import { axiosForBackend } from '@client/src/api/http';
import type {
  SearchDepartmentsParams,
  SearchDepartmentsResponse,
} from '@client/src/components/business-ui/api/directory-types';

export async function searchDepartments(params: SearchDepartmentsParams): Promise<SearchDepartmentsResponse> {
  const response = await axiosForBackend.get('/api/directory/departments', { params });
  return response.data;
}

export type { SearchDepartmentsParams, SearchDepartmentsResponse };
