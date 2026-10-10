import { axiosForBackend } from '@client/src/api/http';
import type {
  AccountType,
  BatchGetUsersResponse,
  ConvertExternalContactResponse,
  SearchUsersParams,
  SearchUsersResponse,
} from '@client/src/components/business-ui/api/directory-types';

export async function searchUsers(params: SearchUsersParams): Promise<SearchUsersResponse> {
  const response = await axiosForBackend.get('/api/directory/users', { params });
  return response.data;
}

export async function listUsersByIds(userIds: string[]): Promise<BatchGetUsersResponse> {
  const response = await axiosForBackend.post('/api/directory/users/batch', { userIds });
  return response.data;
}

export async function convertExternalContact(larkUserID: string): Promise<ConvertExternalContactResponse> {
  const response = await axiosForBackend.post('/api/directory/users/convert-external', { larkUserID });
  return response.data;
}

export type {
  AccountType,
  BatchGetUsersResponse,
  ConvertExternalContactResponse,
  SearchUsersParams,
  SearchUsersResponse,
};
