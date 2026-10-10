import { useEffect, useState } from 'react';
import {
  getPolloCloudCurrentUser,
  type PolloCloudCurrentUser,
} from '@client/src/api/pollocloud';

export function useCurrentUser(): PolloCloudCurrentUser | null | undefined {
  const [user, setUser] = useState<PolloCloudCurrentUser | null>();

  useEffect(() => {
    const controller = new AbortController();
    void getPolloCloudCurrentUser(controller.signal)
      .then(setUser)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('获取当前用户失败', error);
        setUser(null);
      });
    return () => controller.abort();
  }, []);

  return user;
}
