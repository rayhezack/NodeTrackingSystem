import { FeishuDocumentService } from '../../server/modules/ai-tracking/feishu-document.service';

describe('FeishuDocumentService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('应将飞书 docx scope 错误转换为可执行的重新授权提示', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        code: 99991679,
        msg: 'Unauthorized. required one of these privileges: [docx:document, docx:document:readonly]',
      }),
    }) as typeof fetch;

    const service = new FeishuDocumentService();

    await expect(service.fetchPrd(
      'https://example.feishu.cn/docx/doc_token',
      'user-access-token',
    )).rejects.toThrow(
      '当前授权缺少新版文档只读权限（docx:document:readonly），请重新授权',
    );
  });

  it('应区分用户没有目标文档阅读权，而不是误报 OAuth scope', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ code: 1770032, msg: 'forbidden' }),
    }) as typeof fetch;

    const service = new FeishuDocumentService();

    await expect(service.fetchPrd(
      'https://example.feishu.cn/docx/doc_token',
      'user-access-token',
    )).rejects.toThrow(
      '当前飞书账号无权读取这份 PRD，请确认该账号可在飞书中打开文档',
    );
  });

  it('应将飞书接口限流转换为稍后重试提示', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 99991400, msg: 'request trigger frequency limit' }),
    }) as typeof fetch;

    const service = new FeishuDocumentService();

    await expect(service.fetchPrd(
      'https://example.feishu.cn/docx/doc_token',
      'user-access-token',
    )).rejects.toThrow('飞书文档接口请求频率过高，请稍后重试');
  });

  it('应将 Wiki 节点权限错误归类为目标 PRD 阅读权限不足', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 131006, msg: 'node permission denied' }),
    }) as typeof fetch;

    const service = new FeishuDocumentService();

    await expect(service.fetchPrd(
      'https://example.feishu.cn/wiki/wiki_token',
      'user-access-token',
    )).rejects.toThrow(
      '当前飞书账号无权读取这份 PRD，请确认该账号可在飞书中打开文档',
    );
  });

  it('应将飞书网络异常转换为可重试提示', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as typeof fetch;

    const service = new FeishuDocumentService();

    await expect(service.fetchPrd(
      'https://example.feishu.cn/docx/doc_token',
      'user-access-token',
    )).rejects.toThrow('飞书文档服务暂时不可用，请稍后重试');
  });

  it('应将飞书服务端异常转换为可重试提示', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ code: 1771001, msg: 'server internal error' }),
    }) as typeof fetch;

    const service = new FeishuDocumentService();

    await expect(service.fetchPrd(
      'https://example.feishu.cn/docx/doc_token',
      'user-access-token',
    )).rejects.toThrow('飞书文档服务暂时不可用，请稍后重试');
  });
});
