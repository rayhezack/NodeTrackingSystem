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

    expect(error.message).toBe('Gateway Timeout');
    expect(error.status).toBe(504);
  });
});
