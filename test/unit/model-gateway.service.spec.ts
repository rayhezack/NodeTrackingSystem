import { ModelGatewayService } from '../../server/modules/ai-tracking/model-gateway.service';

describe('ModelGatewayService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.AI_PROVIDER = 'kimi';
    process.env.AI_MODEL = 'kimi-k3';
    process.env.AI_REASONING_EFFORT = 'medium';
    process.env.KIMI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('Kimi 3 埋点设计请求应关闭深度思考并使用中等推理强度', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    }) as typeof fetch;
    const service = new ModelGatewayService();

    await service.generateJson([{ role: 'user', content: '生成 JSON' }]);

    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'kimi-k3',
      temperature: 0.6,
      thinking: { type: 'disabled' },
      reasoning_effort: 'medium',
    });
  });
});
