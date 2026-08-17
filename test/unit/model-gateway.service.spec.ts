import { ModelGatewayService } from '../../server/modules/ai-tracking/model-gateway.service';

describe('ModelGatewayService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.AI_PROVIDER = 'kimi';
    process.env.AI_MODEL = 'kimi-k2.6';
    process.env.KIMI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('Kimi K2.6 请求应使用模型唯一允许的 temperature=1', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    }) as typeof fetch;
    const service = new ModelGatewayService();

    await service.generateJson([{ role: 'user', content: '生成 JSON' }]);

    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.temperature).toBe(1);
  });
});
