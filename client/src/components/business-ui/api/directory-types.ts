export type I18nText = { zh_cn: string; en_us?: string; ja_jp?: string };
export type AccountType = 'apaas' | 'lark';
export type UserType = '_employee' | '_externalUser' | '_anonymousUser';

export type LeaderUser = { employeeID?: string; miaodaUserID?: string };
export type DepartmentBasic = {
  departmentID: string;
  name: I18nText;
  openDepartmentID?: string;
};
export type UserInfo = {
  userID: string;
  larkUserID: string;
  name: I18nText;
  avatar: string;
  userType: UserType;
  department: DepartmentBasic;
  email?: string;
  tenantName?: string;
  miaodaUserID?: string;
  employeeID?: string;
  larkID?: string;
  nickname?: I18nText;
  mobile?: string;
  gender?: string;
  country?: string;
  workStation?: string;
  employeeNo?: string;
  city?: string;
  jobTitle?: I18nText;
  employeeType?: string;
  leader?: LeaderUser;
  dottedLineLeaders?: LeaderUser[];
};
export type SearchAvatar = { avatar: { image: { large: string } } };
export type SearchUsersParams = {
  query?: string;
  offset?: number;
  pageSize?: number;
  searchExternalContact?: boolean;
  needFullFields?: boolean;
};
export type SearchUsersResponse = { data: { userList: UserInfo[]; total: number }; status_code: string };
export type BatchGetUsersResponse = {
  data: { userInfoMap: Record<string, UserInfo & SearchAvatar>; baseResp?: { statusCode?: number; statusMessage?: string } };
};
export type ConvertExternalContactResponse = { data: { userInfo: { tenantID: number; userID: number } } };

export type DepartmentInfo = {
  departmentID: string;
  larkDepartmentID: string;
  openDepartmentID?: string;
  name: I18nText;
};
export type SearchDepartmentsParams = { query?: string; offset?: number; pageSize?: number };
export type SearchDepartmentsResponse = { data: { departmentList: DepartmentInfo[]; total: number }; status_code: string };

export type ChatInfo = {
  chatID: string;
  openChatID?: string;
  name: I18nText;
  avatar: string;
  isExternal?: boolean;
  userCount?: number;
};
export type SearchChatsParams = { query?: string; offset?: number; pageSize?: number };
export type SearchChatsResponse = { data: { result: { chatResult?: { total: number; items: ChatInfo[] } } }; status_code: string };
export type BatchGetChatsResponse = { data: { chatInfoMap: Record<string, ChatInfo> }; status_code: string };

export type UserProfileData = {
  useLarkCard: false;
  userProfileInfo: {
    name?: string;
    avatar?: string;
    email?: string;
    userStatus: 0 | 1 | 2 | 3 | 4;
    userType: '_employee' | '_externalUser';
  };
};
