import { ModelGatewayService } from '../../server/modules/ai-tracking/model-gateway.service';

describe('ModelGatewayService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.AI_MODEL = 'gpt-5.5';
    delete process.env.AI_REASONING_EFFORT;
    delete process.env.AI_WIRE_API;
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('GPT 5.5 埋点设计请求应使用高推理、低 verbosity 和输出预算', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ output_text: '{}' }),
    }) as typeof fetch;
    const service = new ModelGatewayService();

    await service.generateJson([
      { role: 'system', content: '你是埋点设计助手' },
      { role: 'user', content: '生成 JSON' },
    ]);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.anything(),
    );
    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-5.5',
      reasoning: { effort: 'high' },
      text: { format: { type: 'json_object' }, verbosity: 'low' },
      instructions: '你是埋点设计助手',
      max_output_tokens: 12_000,
      stream: true,
      store: false,
    });
    expect(body).not.toHaveProperty('messages');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('thinking');
  });

  it('应解析 Responses API 的 SSE 文本增量，避免长推理被中转站空闲超时切断', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      text: async () => [
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"{\\"events\\":"}',
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"[]}"}',
        'data: [DONE]',
      ].join('\n\n'),
    }) as typeof fetch;
    const service = new ModelGatewayService();

    await expect(service.generateJson([{ role: 'user', content: '生成 JSON' }]))
      .resolves.toEqual({ events: [] });
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
      .rejects.toThrow('AI 中转站连接中断');
  });
});
