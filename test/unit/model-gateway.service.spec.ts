import { ModelGatewayService } from '../../server/modules/ai-tracking/model-gateway.service';

describe('ModelGatewayService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.AI_BASE_URL = 'https://api.moonshot.cn/v1';
    process.env.AI_MODEL = 'kimi-k3';
    process.env.KIMI_API_KEY = 'test-api-key';
    delete process.env.MOONSHOT_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_REASONING_EFFORT;
    delete process.env.AI_WIRE_API;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('应使用 Kimi K3 Chat Completions、低推理强度和 JSON Mode', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ choices: [{ message: { content: '{"events":[]}' } }] }),
    }) as typeof fetch;
    const service = new ModelGatewayService();

    await expect(service.generateJson([
      { role: 'system', content: '你是埋点设计助手' },
      { role: 'user', content: '生成 JSON' },
    ])).resolves.toEqual({ events: [] });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.moonshot.cn/v1/chat/completions',
      expect.anything(),
    );
    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'kimi-k3',
      reasoning_effort: 'low',
      max_completion_tokens: 12_000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你是埋点设计助手' },
        { role: 'user', content: '生成 JSON' },
      ],
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('reasoning');
    expect(body).not.toHaveProperty('input');
  });

  it('Kimi 网关不支持 JSON Mode 时应只兼容重试一次', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ error: { message: 'response_format is not supported' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ choices: [{ message: { content: '{"events":[]}' } }] }),
      }) as typeof fetch;
    const service = new ModelGatewayService();

    await expect(service.generateJson([{ role: 'user', content: '生成 JSON' }]))
      .resolves.toEqual({ events: [] });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const fallbackRequest = (global.fetch as jest.Mock).mock.calls[1][1] as RequestInit;
    const fallbackBody = JSON.parse(String(fallbackRequest.body)) as Record<string, unknown>;
    expect(fallbackBody).not.toHaveProperty('response_format');
    expect(fallbackBody).toHaveProperty('reasoning_effort', 'low');
  });

  it('未配置 Kimi Key 时应明确提示配置项', async () => {
    delete process.env.KIMI_API_KEY;
    const service = new ModelGatewayService();

    await expect(service.generateJson([{ role: 'user', content: '生成 JSON' }]))
      .rejects.toThrow('未配置 KIMI_API_KEY');
  });

  it('中转站网络超时应返回可操作的错误提示，而不是服务器内部错误', async () => {
    const networkError = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ETIMEDOUT' },
    });
    global.fetch = jest.fn().mockRejectedValue(networkError) as typeof fetch;
    const service = new ModelGatewayService();

    await expect(service.generateJson([{ role: 'user', content: '生成 JSON' }]))
      .rejects.toThrow('大模型服务连接超时');
  });

  it('中转站提前关闭连接时应返回明确的连接中断提示', async () => {
    const networkError = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'UND_ERR_SOCKET' },
    });
    global.fetch = jest.fn().mockRejectedValue(networkError) as typeof fetch;
    const service = new ModelGatewayService();

    await expect(service.generateJson([{ role: 'user', content: '生成 JSON' }]))
      .rejects.toThrow('Kimi 服务连接中断');
  });
});
