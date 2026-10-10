import { axiosForBackend } from '@client/src/api/http';
import type { AccountType, UserProfileData } from '@client/src/components/business-ui/api/directory-types';

export async function fetchUserProfile(
  userId: string,
  accountType: AccountType = 'apaas',
  signal?: AbortSignal,
): Promise<UserProfileData> {
  const response = await axiosForBackend.get(`/api/directory/users/${encodeURIComponent(userId)}/profile`, {
    params: { accountType },
    signal,
  });
  return response.data;
}

export type { AccountType, UserProfileData };
