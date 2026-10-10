'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { fetchUserProfile } from '@client/src/components/business-ui/api/user-profiles/service';
import { ErrorImage } from '@client/src/components/business-ui/user-profile/error-image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { UserInput } from '@client/src/components/business-ui/types/user';

interface UserProfileProps {
  readonly value?: string | UserInput;
  readonly userId?: string | undefined;
  readonly user_id?: string | undefined;
  readonly accountType?: 'apaas' | 'lark' | undefined;
}

type BaseUserProfileProps = BaseSimpleProfileProps;

const ACCOUNT_STATUS = {
  UNSPECIFIED: 0,
  Inactive: 1,
  Active: 2,
  Disabled: 3,
  Terminated: 4,
  NotJoined: 5,
  Resigned: 6,
} as const;
type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

const AccountStatusMap: Record<AccountStatus, string> = {
  [ACCOUNT_STATUS.UNSPECIFIED]: '',
  [ACCOUNT_STATUS.Active]: '已启用',
  [ACCOUNT_STATUS.Inactive]: '未激活',
  [ACCOUNT_STATUS.Disabled]: '已停用',
  [ACCOUNT_STATUS.Terminated]: '已停用',
  [ACCOUNT_STATUS.NotJoined]: '未激活',
  [ACCOUNT_STATUS.Resigned]: '已停用',
};

interface BaseSimpleProfileProps {
  readonly useLarkCard: false;
  readonly userProfileInfo: {
    readonly name?: string;
    readonly avatar?: string;
    readonly email?: string;
    //
    readonly userStatus: AccountStatus;
    readonly userType: '_employee' | '_externalUser';
  };
}

function UserProfile(props: UserProfileProps) {
  const { value, userId: originUserId, user_id, accountType = 'apaas' } = props;

  const userId =
    (typeof value === 'string'
      ? value
      : (value as any)?.user_id || (value as any)?.userId) ||
    user_id ||
    originUserId;

  const [loading, setLoading] = useState<boolean>(true);
  const [response, setResponse] = useState<BaseUserProfileProps>(
    {} as BaseUserProfileProps,
  );
  const [error, setError] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    if (!userId) return;

    const controller = new AbortController();

    setLoading(true);
    setError(false);

    try {
      const data = await fetchUserProfile(userId, accountType, controller.signal);
      setResponse(data as BaseUserProfileProps);
      setLoading(false);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        // 直接退出，不处理 AbortError
      } else {
        // 最终的UI反馈
        setError(true);
        setLoading(false);
      }
    }
  }, [userId, accountType]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (error) {
    return (
      <Card
        className="flex min-h-124 w-80 flex-col items-center justify-center gap-4 border-0 p-0"
      >
        <ErrorImage />
        {/* <Button variant="outline" className="border-red-500 text-black hover:bg-red-50" onClick={fetchData}>
        加载失败 请重试
      </Button> */}
        <div>
          <span className="text-sm">加载失败 请</span>
          <Button
            size="sm"
            variant="ghost"
            className="pr-1 pl-1 text-primary! not-disabled:hover:bg-primary/10 not-disabled:hover:text-primary/90 focus-visible:bg-primary/20"
            onClick={fetchData}
          >
            重试
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <Card
      className="flex h-130 w-80 flex-col items-center justify-center gap-6 border-0 p-0"
    >
      {loading ? <LoadingComponent /> : <BaseUserProfile {...response} />}
    </Card>
  );
}

function LoadingComponent() {
  return <Spinner className="size-8 animate-spin text-primary" />;
}

function BaseUserProfile(props: BaseUserProfileProps) {
  return <SimpleUserProfile userProfileInfo={props.userProfileInfo} />;
}

function SimpleUserProfile(props: {
  readonly userProfileInfo: BaseSimpleProfileProps['userProfileInfo'];
}) {
  const { userProfileInfo } = props;

  return (
    <Card className="flex w-80 flex-col gap-0 overflow-hidden border-0 p-0">
      <div className="h-34 w-full border-b bg-muted" />

      <CardContent className="h-96 w-80 pt-0 pr-4 pb-4 pl-4">
        <div className="relative">
          <Avatar className="absolute left-0 size-22.5 -translate-y-1/2 border-2 border-background">
            <AvatarImage
              src={userProfileInfo.avatar}
              alt={userProfileInfo.name}
            />
            <AvatarFallback>{userProfileInfo.name?.at(0)}</AvatarFallback>
          </Avatar>

          <div className="pt-13.5">
            <div className="flex items-center gap-2 pt-0.5 pb-1.5 leading-tight font-semibold">
              <span className="text-xl">{userProfileInfo.name}</span>
              {userProfileInfo.userType === '_externalUser' && (
                <Badge className="rounded-sm border-0 bg-blue-500/20 pt-px pr-1.5 pb-px pl-1 text-sm text-blue-900">
                  外部
                </Badge>
              )}
              {AccountStatusMap[userProfileInfo.userStatus] !== '' && (
                <Badge className="rounded-sm border-0 bg-foreground/10 pt-px pr-1.5 pb-px pl-1 text-sm text-foreground">
                  {AccountStatusMap[userProfileInfo.userStatus]}
                </Badge>
              )}
            </div>
            {userProfileInfo.email && (
              <div className="mt-6 grid grid-cols-[84px_1fr] gap-y-3 text-sm">
                <div className="text-muted-foreground">邮箱</div>
                <div>
                  <a
                    className="break-all text-primary underline-offset-4 hover:underline"
                    href={`mailto:${userProfileInfo.email ?? ''}`}
                  >
                    {userProfileInfo.email}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { UserProfile };
