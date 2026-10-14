import { toReadableError } from '../../client/src/api/error';

describe('前端 API 错误', () => {
  it('应保留 HTTP 状态码以识别网关超时并恢复最终状态', () => {
    const error = toReadableError({
      message: 'Request failed with status code 504',
      response: {
        status: 504,
        data: { message: 'Gateway Timeout' },
      },
    }, '请求失败') as Error & { status?: number };

    expect(error.message).toBe('服务响应超时（HTTP 504），请稍后重试');
    expect(error.status).toBe(504);
  });

  it('converts a plaintext 524 response into a readable timeout with its status', () => {
    const error = toReadableError({ response: { status: 524, data: 'error code: 524' } }, '请求失败') as Error & { status?: number };
    expect(error.message).toContain('服务响应超时（HTTP 524）');
    expect(error.status).toBe(524);
  });

  it('preserves the status of errors decoded from a streaming response', () => {
    const original = Object.assign(new Error('上游响应超时'), { status: 502 });
    const error = toReadableError(original, '请求失败') as Error & { status?: number };
    expect(error.message).toBe('上游响应超时');
    expect(error.status).toBe(502);
  });
});
