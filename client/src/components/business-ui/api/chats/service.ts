import { axiosForBackend } from '@client/src/api/http';
import type {
  BatchGetChatsResponse,
  ChatInfo,
  SearchChatsParams,
  SearchChatsResponse,
} from '@client/src/components/business-ui/api/directory-types';

export async function searchChats(params: SearchChatsParams): Promise<SearchChatsResponse> {
  const response = await axiosForBackend.get('/api/directory/chats', { params });
  return response.data;
}

export async function listChatsByIds(chatIds: string[]): Promise<BatchGetChatsResponse> {
  const response = await axiosForBackend.post('/api/directory/chats/batch', { chatIds });
  return response.data;
}

export type { BatchGetChatsResponse, ChatInfo, SearchChatsParams, SearchChatsResponse };
