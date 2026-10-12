import { searchBitableRecords } from './feishu-bitable';
import {
  aiOAuthCallbackHtml,
  applyAiDraft,
  completeAiAuthorization,
  generateAiDraft,
  getAiAuthStatus,
  getAiConfigStatus,
  getAiDraft,
  getLatestAiDraft,
  startAiAuthorization,
  type AiWorkerEnv,
} from './ai-tracking';
import {
  getDirectoryUserProfile,
  listDirectoryChatsByIds,
  listDirectoryUsersByIds,
  searchDirectoryChats,
  searchDirectoryDepartments,
  searchDirectoryUsers,
} from './feishu-directory';
import { getBitableMediaPreviewUrl, uploadBitableImage } from './feishu-files';
import { resolveCanonicalIdentity } from './pollocloud-identity';
import { getOfficialEvents, getOfficialParams } from './query-library';
import {
  getTrackingRecords,
  getTrackingDetail,
  getTrackingParams,
  getTrackingStageStats,
  getTrackingTodos,
  getWorkbenchDashboard,
} from './tracking-read';
import {
  batchDeleteTrackingParams,
  createTrackingParam,
  createTrackingRecord,
  createSiblingTrackingEvent,
  deleteTrackingParam,
  deleteTrackingEvent,
  deleteTrackingRequest,
  getPermissionConfig,
  reuseOfficialTrackingEvent,
  TrackingWriteError,
  updateTrackingParam,
  updatePermissionConfig,
  updateTrackingRecord,
} from './tracking-write';
import type {
  BatchDeleteParamsRequest,
  ApplyAiTrackingDraftRequest,
  CreateParamRequest,
  CreateSiblingTrackingEventRequest,
  CreateTrackingRecordRequest,
  GenerateAiTrackingDraftRequest,
  GetTrackingRecordsParams,
  ReuseOfficialEventRequest,
  TrackingSourceFilter,
  UpdateParamRequest,
  UpdatePermissionConfigRequest,
  UpdateTrackingRecordRequest,
} from '../shared/api.interface';

export interface PolloCloudUser {
  id: string;
  name: string;
}

export interface WorkerEnv extends AiWorkerEnv {
  TRACKING_APP_URL?: string;
}

export function resolvePolloCloudUser(headers: Headers): PolloCloudUser | null {
  const id = headers.get('x-pollocloud-user-id')?.trim() || '';
  if (!id) return null;

  return {
    id,
    name: decodeHeader(headers.get('x-pollocloud-user-name')),
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv = {}): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ status: 'ok' });
    }

    if (request.method === 'GET' && url.pathname === '/api/me') {
      const platformUser = resolvePolloCloudUser(request.headers);
      if (!platformUser) return json({ message: 'Unauthorized' }, 401);
      try {
        const user = await resolveCanonicalIdentity(env, platformUser);
        return json({
          user_id: user.id,
          name: user.name,
          platform_user_id: user.platformId,
          ...(user.openId ? { open_id: user.openId } : {}),
          ...(user.email ? { email: user.email } : {}),
        });
      } catch (error) {
        return json({ message: error instanceof Error ? error.message : 'Current user mapping failed' }, 502);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/tracking/ai/feishu-auth/callback') {
      try {
        await completeAiAuthorization(env, url.searchParams.get('code') || '', url.searchParams.get('state') || '', url.searchParams.get('error'), url.origin);
        return html(aiOAuthCallbackHtml(true, '飞书文档授权成功，可以返回埋点系统继续生成。'));
      } catch (error) {
        return html(aiOAuthCallbackHtml(false, error instanceof Error ? error.message : '飞书文档授权失败'), 400);
      }
    }

    if (url.pathname.startsWith('/api/tracking/ai/')) {
      const platformUser = resolvePolloCloudUser(request.headers);
      if (!platformUser) return json({ message: 'Unauthorized' }, 401);
      try {
        const user = await resolveCanonicalIdentity(env, platformUser);
        if (request.method === 'GET' && url.pathname === '/api/tracking/ai/config') {
          return json(getAiConfigStatus(env, url.origin));
        }
        if (request.method === 'GET' && url.pathname === '/api/tracking/ai/feishu-auth/status') {
          return json(await getAiAuthStatus(env, user.id));
        }
        if (request.method === 'POST' && url.pathname === '/api/tracking/ai/feishu-auth/start') {
          const body = await request.json() as { recordId?: string };
          return json(await startAiAuthorization(env, user.id, body.recordId || '', url.origin));
        }
        const latestDraftMatch = url.pathname.match(/^\/api\/tracking\/ai\/records\/([^/]+)\/drafts\/latest$/);
        if (request.method === 'GET' && latestDraftMatch) {
          return json(await getLatestAiDraft(env, user.id, decodeURIComponent(latestDraftMatch[1])));
        }
        const draftMatch = url.pathname.match(/^\/api\/tracking\/ai\/records\/([^/]+)\/drafts\/([^/]+)$/);
        if (request.method === 'GET' && draftMatch) {
          return json(await getAiDraft(env, user.id, decodeURIComponent(draftMatch[1]), decodeURIComponent(draftMatch[2])));
        }
        const applyDraftMatch = url.pathname.match(/^\/api\/tracking\/ai\/records\/([^/]+)\/drafts\/([^/]+)\/apply$/);
        if (request.method === 'POST' && applyDraftMatch) {
          return json(await applyAiDraft(env, user.id, decodeURIComponent(applyDraftMatch[1]), decodeURIComponent(applyDraftMatch[2]), await request.json() as ApplyAiTrackingDraftRequest));
        }
        const generateDraftMatch = url.pathname.match(/^\/api\/tracking\/ai\/records\/([^/]+)\/drafts$/);
        if (request.method === 'POST' && generateDraftMatch) {
          return json(await generateAiDraft(env, decodeURIComponent(generateDraftMatch[1]), await request.json() as GenerateAiTrackingDraftRequest, user.id, url.origin));
        }
      } catch (error) {
        const status = error instanceof TrackingWriteError ? error.status : 502;
        return json({ message: error instanceof Error ? error.message : 'AI tracking request failed' }, status);
      }
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/tracking/')) {
      const platformUser = resolvePolloCloudUser(request.headers);
      if (!platformUser) return json({ message: 'Unauthorized' }, 401);
      try {
        const user = await resolveCanonicalIdentity(env, platformUser);
        const source = normalizeSourceFilter(url.searchParams.get('source'));
        if (url.pathname === '/api/tracking/dashboard') {
          return json(await getWorkbenchDashboard(env, {
            ...trackingListParams(url.searchParams, source),
            todoLimit: Number(url.searchParams.get('todoLimit') || 10),
          }, user.id));
        }
        if (url.pathname === '/api/tracking/stats') {
          return json(await getTrackingStageStats(env, source));
        }
        if (url.pathname === '/api/tracking/my-todos') {
          return json(await getTrackingTodos(env, source, Number(url.searchParams.get('limit') || 10), user.id));
        }
        if (url.pathname === '/api/tracking/records') {
          return json(await getTrackingRecords(env, trackingListParams(url.searchParams, source)));
        }
        if (url.pathname === '/api/tracking/permissions') {
          return json(await getPermissionConfig(env, user.id));
        }
        const trackingParamsMatch = url.pathname.match(/^\/api\/tracking\/records\/([^/]+)\/params$/);
        if (trackingParamsMatch) {
          return json(await getTrackingParams(env, decodeURIComponent(trackingParamsMatch[1])));
        }
        const trackingDetailMatch = url.pathname.match(/^\/api\/tracking\/records\/([^/]+)$/);
        if (trackingDetailMatch) {
          return json(await getTrackingDetail(env, decodeURIComponent(trackingDetailMatch[1]), user.id));
        }
        if (url.pathname === '/api/tracking/notifications/status') {
          return json({
            configured: Boolean(env.FEISHU_APP_ID && env.FEISHU_APP_SECRET),
            hasAppId: Boolean(env.FEISHU_APP_ID),
            hasAppSecret: Boolean(env.FEISHU_APP_SECRET),
            usingDefaultAppId: false,
          });
        }
      } catch (error) {
        return json({ message: error instanceof Error ? error.message : 'Tracking request failed' }, 502);
      }
    }

    if (url.pathname.startsWith('/api/tracking/')) {
      const platformUser = resolvePolloCloudUser(request.headers);
      if (!platformUser) return json({ message: 'Unauthorized' }, 401);
      try {
        const user = await resolveCanonicalIdentity(env, platformUser);
        if (request.method === 'POST' && url.pathname === '/api/tracking/records') {
          const body = await request.json() as CreateTrackingRecordRequest;
          return json(await createTrackingRecord(env, body, { user_id: user.id, name: user.name }), 201);
        }
        if (request.method === 'PUT' && url.pathname === '/api/tracking/permissions') {
          return json(await updatePermissionConfig(env, await request.json() as UpdatePermissionConfigRequest, user.id));
        }
        const batchDeleteMatch = url.pathname.match(/^\/api\/tracking\/records\/([^/]+)\/params\/batch-delete$/);
        if (request.method === 'POST' && batchDeleteMatch) {
          return json(await batchDeleteTrackingParams(env, decodeURIComponent(batchDeleteMatch[1]), await request.json() as BatchDeleteParamsRequest, user.id));
        }
        const recordEventsMatch = url.pathname.match(/^\/api\/tracking\/records\/([^/]+)\/events$/);
        if (request.method === 'POST' && recordEventsMatch) {
          return json(await createSiblingTrackingEvent(env, decodeURIComponent(recordEventsMatch[1]), await request.json() as CreateSiblingTrackingEventRequest, user.id), 201);
        }
        const deleteRequestMatch = url.pathname.match(/^\/api\/tracking\/records\/([^/]+)\/request$/);
        if (request.method === 'DELETE' && deleteRequestMatch) {
          return json(await deleteTrackingRequest(env, decodeURIComponent(deleteRequestMatch[1]), user.id));
        }
        const reuseOfficialMatch = url.pathname.match(/^\/api\/tracking\/records\/([^/]+)\/reuse-official-event$/);
        if (request.method === 'POST' && reuseOfficialMatch) {
          return json(await reuseOfficialTrackingEvent(env, decodeURIComponent(reuseOfficialMatch[1]), await request.json() as ReuseOfficialEventRequest, user.id));
        }
        const recordParamsMatch = url.pathname.match(/^\/api\/tracking\/records\/([^/]+)\/params$/);
        if (request.method === 'POST' && recordParamsMatch) {
          return json(await createTrackingParam(env, decodeURIComponent(recordParamsMatch[1]), await request.json() as CreateParamRequest, user.id), 201);
        }
        const recordMatch = url.pathname.match(/^\/api\/tracking\/records\/([^/]+)$/);
        if (request.method === 'PATCH' && recordMatch) {
          return json(await updateTrackingRecord(env, decodeURIComponent(recordMatch[1]), await request.json() as UpdateTrackingRecordRequest, user.id));
        }
        if (request.method === 'DELETE' && recordMatch) {
          return json(await deleteTrackingEvent(env, decodeURIComponent(recordMatch[1]), user.id));
        }
        const paramMatch = url.pathname.match(/^\/api\/tracking\/params\/([^/]+)$/);
        if (request.method === 'PUT' && paramMatch) {
          return json(await updateTrackingParam(env, decodeURIComponent(paramMatch[1]), await request.json() as UpdateParamRequest, user.id));
        }
        if (request.method === 'DELETE' && paramMatch) {
          return json(await deleteTrackingParam(env, decodeURIComponent(paramMatch[1]), user.id));
        }
      } catch (error) {
        const status = error instanceof TrackingWriteError ? error.status : 502;
        return json({ message: error instanceof Error ? error.message : 'Tracking write failed' }, status);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/bitable/records') {
      const user = resolvePolloCloudUser(request.headers);
      if (!user) return json({ message: 'Unauthorized' }, 401);
      try {
        const data = await searchBitableRecords(env, url.searchParams.get('instance') || '', {
          pageSize: Number(url.searchParams.get('page_size') || 100),
          pageToken: url.searchParams.get('page_token') || undefined,
        });
        return json({ data });
      } catch (error) {
        return json({ message: error instanceof Error ? error.message : 'Bitable request failed' }, 502);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/query-library/events') {
      const user = resolvePolloCloudUser(request.headers);
      if (!user) return json({ message: 'Unauthorized' }, 401);
      try {
        return json(await getOfficialEvents(env, {
          source: url.searchParams.get('source') === 'web' ? 'web' : 'app',
          keyword: url.searchParams.get('keyword') || undefined,
          category: url.searchParams.get('category') || undefined,
          pageSize: Number(url.searchParams.get('pageSize') || 50),
          pageToken: url.searchParams.get('pageToken') || undefined,
        }));
      } catch (error) {
        return json({ message: error instanceof Error ? error.message : 'Query library request failed' }, 502);
      }
    }

    const officialParamsMatch = url.pathname.match(/^\/api\/query-library\/events\/([^/]+)\/params$/);
    if (request.method === 'GET' && officialParamsMatch) {
      const user = resolvePolloCloudUser(request.headers);
      if (!user) return json({ message: 'Unauthorized' }, 401);
      try {
        return json(await getOfficialParams(env, decodeURIComponent(officialParamsMatch[1])));
      } catch (error) {
        return json({ message: error instanceof Error ? error.message : 'Query library request failed' }, 502);
      }
    }

    if (url.pathname.startsWith('/api/directory/')) {
      const user = resolvePolloCloudUser(request.headers);
      if (!user) return json({ message: 'Unauthorized' }, 401);
      try {
        if (request.method === 'GET' && url.pathname === '/api/directory/users') {
          return json(await searchDirectoryUsers(env, url.searchParams.get('query') || '', Number(url.searchParams.get('pageSize') || 100)));
        }
        if (request.method === 'POST' && url.pathname === '/api/directory/users/batch') {
          const body = await request.json() as { userIds?: string[] };
          return json(await listDirectoryUsersByIds(env, Array.isArray(body.userIds) ? body.userIds : []));
        }
        if (request.method === 'GET' && url.pathname.startsWith('/api/directory/users/') && url.pathname.endsWith('/profile')) {
          const userId = decodeURIComponent(url.pathname.slice('/api/directory/users/'.length, -'/profile'.length));
          return json(await getDirectoryUserProfile(env, userId));
        }
        if (request.method === 'GET' && url.pathname === '/api/directory/departments') {
          return json(await searchDirectoryDepartments(env, url.searchParams.get('query') || '', Number(url.searchParams.get('pageSize') || 100)));
        }
        if (request.method === 'GET' && url.pathname === '/api/directory/chats') {
          return json(await searchDirectoryChats(env, url.searchParams.get('query') || '', Number(url.searchParams.get('pageSize') || 100)));
        }
        if (request.method === 'POST' && url.pathname === '/api/directory/chats/batch') {
          const body = await request.json() as { chatIds?: string[] };
          return json(await listDirectoryChatsByIds(env, Array.isArray(body.chatIds) ? body.chatIds : []));
        }
        if (request.method === 'POST' && url.pathname === '/api/directory/users/convert-external') {
          return json({ message: 'External contact conversion requires a Feishu user access token' }, 501);
        }
      } catch (error) {
        return json({ message: error instanceof Error ? error.message : 'Directory request failed' }, 502);
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/files/upload') {
      const user = resolvePolloCloudUser(request.headers);
      if (!user) return json({ message: 'Unauthorized' }, 401);
      try {
        const body = await request.formData();
        const file = body.get('file');
        if (!(file instanceof File)) return json({ message: 'File is required' }, 400);
        return json(await uploadBitableImage(env, file, String(body.get('source') || 'app')));
      } catch (error) {
        return json({ message: error instanceof Error ? error.message : 'File upload failed' }, 502);
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/tracking/ui-image-preview') {
      const user = resolvePolloCloudUser(request.headers);
      if (!user) return json({ message: 'Unauthorized' }, 401);
      try {
        const body = await request.json() as { attachment?: Record<string, unknown> };
        const attachment = body.attachment || {};
        const directUrl = firstText(attachment.url, attachment.download_url, attachment.downloadUrl, attachment.tmp_url);
        if (directUrl) return json({ url: directUrl, source: 'direct' });
        const fileToken = firstText(attachment.file_token, attachment.fileToken, attachment.token);
        if (!fileToken) return json({ url: '', reason: 'NO_PREVIEW_SOURCE' });
        const previewUrl = await getBitableMediaPreviewUrl(env, fileToken);
        return json(previewUrl ? { url: previewUrl, source: 'direct' } : { url: '', reason: 'STORAGE_LOOKUP_FAILED' });
      } catch (error) {
        return json({ message: error instanceof Error ? error.message : 'File preview failed' }, 502);
      }
    }

    return json({ message: 'Not Found' }, 404);
  },
};

function decodeHeader(value: string | null): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function firstText(...values: unknown[]): string {
  return values.find((value) => typeof value === 'string' && value.trim())?.toString().trim() || '';
}

function normalizeSourceFilter(value: string | null): TrackingSourceFilter | undefined {
  return value === 'app' || value === 'web' || value === 'all' ? value : undefined;
}

function trackingListParams(params: URLSearchParams, source?: TrackingSourceFilter): GetTrackingRecordsParams {
  return {
    source,
    keyword: params.get('keyword') || undefined,
    stage: params.get('stage') || undefined,
    priority: params.get('priority') || undefined,
    platform: params.get('platform') || undefined,
    owner: params.get('owner') || undefined,
    pageSize: Number(params.get('pageSize') || 50),
    pageToken: params.get('pageToken') || undefined,
  };
}
