import { BadRequestException, Injectable } from '@nestjs/common';

interface FeishuApiResponse<T> {
  code?: number;
  msg?: string;
  data?: T;
}

export interface FeishuPrdDocument {
  url: string;
  title: string;
  revision?: string;
  content: string;
  truncated: boolean;
}

@Injectable()
export class FeishuDocumentService {
  async fetchPrd(url: string, accessToken: string): Promise<FeishuPrdDocument> {
    const parsed = parseFeishuDocumentUrl(url);
    let documentToken = parsed.token;
    let title = '';

    if (parsed.type === 'wiki') {
      const node = await this.get<{
        node?: { obj_type?: string; obj_token?: string; title?: string };
      }>(`https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(parsed.token)}`, accessToken);
      if (node.node?.obj_type !== 'docx' || !node.node.obj_token) {
        throw new BadRequestException('MVP 目前仅支持飞书 docx/wiki 正文；该 Wiki 节点不是 docx');
      }
      documentToken = node.node.obj_token;
      title = node.node.title || '';
    }

    const document = await this.get<{ document?: { title?: string; revision_id?: number } }>(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${encodeURIComponent(documentToken)}`,
      accessToken,
    );
    const raw = await this.get<{ content?: string }>(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${encodeURIComponent(documentToken)}/raw_content`,
      accessToken,
    );
    const content = String(raw.content || '').trim();
    if (!content) throw new BadRequestException('PRD 正文为空，无法生成埋点草稿');
    const maxChars = 60_000;
    return {
      url,
      title: document.document?.title || title || '未命名 PRD',
      revision: document.document?.revision_id != null ? String(document.document.revision_id) : undefined,
      content: content.slice(0, maxChars),
      truncated: content.length > maxChars,
    };
  }

  private async get<T>(url: string, accessToken: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      throw new BadRequestException('飞书文档服务暂时不可用，请稍后重试');
    }
    const payload = (await response.json().catch(() => ({}))) as FeishuApiResponse<T>;
    if (!response.ok || Number(payload.code || 0) !== 0 || !payload.data) {
      if (
        Number(payload.code) === 99991679 &&
        /docx:document(?::readonly)?/i.test(String(payload.msg || ''))
      ) {
        throw new BadRequestException(
          '当前授权缺少新版文档只读权限（docx:document:readonly），请重新授权',
        );
      }
      if (Number(payload.code) === 1770032 || Number(payload.code) === 131006) {
        throw new BadRequestException(
          '当前飞书账号无权读取这份 PRD，请确认该账号可在飞书中打开文档后重试',
        );
      }
      if (Number(payload.code) === 99991400) {
        throw new BadRequestException('飞书文档接口请求频率过高，请稍后重试');
      }
      if (response.status >= 500) {
        throw new BadRequestException('飞书文档服务暂时不可用，请稍后重试');
      }
      throw new BadRequestException(payload.msg || '飞书文档读取失败，请检查文档权限和 OAuth Scope');
    }
    return payload.data;
  }
}

function parseFeishuDocumentUrl(value: string): { type: 'wiki' | 'docx'; token: string } {
  let url: URL;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new BadRequestException('需求链接不是有效的飞书文档 URL');
  }
  if (!url.hostname.endsWith('.feishu.cn') && url.hostname !== 'feishu.cn') {
    throw new BadRequestException('MVP 目前仅支持飞书域名下的 docx/wiki 文档');
  }
  const match = url.pathname.match(/^\/(wiki|docx)\/([A-Za-z0-9_-]+)/);
  if (!match) throw new BadRequestException('MVP 目前仅支持 /wiki/ 或 /docx/ 链接');
  return { type: match[1] as 'wiki' | 'docx', token: match[2] };
}
