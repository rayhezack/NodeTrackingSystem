import { ModelGatewayService } from '../../server/modules/ai-tracking/model-gateway.service';

describe('ModelGatewayService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.AI_MODEL = 'gpt-5.6-terra';
    process.env.AI_REASONING_EFFORT = 'high';
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('GPT Terra 埋点设计请求应使用高推理强度并生成 JSON 响应', async () => {
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
      model: 'gpt-5.6-terra',
      temperature: 0.1,
      reasoning_effort: 'high',
    });
    expect(body).not.toHaveProperty('thinking');
  });
});
