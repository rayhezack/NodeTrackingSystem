export function toReadableError(error: unknown, fallbackMessage: string): Error {
  const response = (error as { response?: { data?: unknown; status?: number } })?.response;
  const backendMessage = extractMessage(response?.data);
  const originalMessage = error instanceof Error ? error.message : '';
  const readableError = new Error(backendMessage || originalMessage || fallbackMessage) as Error & {
    status?: number;
  };
  if (typeof response?.status === 'number') readableError.status = response.status;
  return readableError;
}

function extractMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const payload = data as Record<string, unknown>;
  const nestedError =
    payload.error && typeof payload.error === 'object'
      ? (payload.error as Record<string, unknown>)
      : null;
  const candidates = [
    payload.message,
    nestedError?.message,
    nestedError?.details,
    typeof payload.error === 'string' ? payload.error : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
    if (Array.isArray(candidate)) {
      const joined = candidate.filter((item) => typeof item === 'string').join('；');
      if (joined) return joined;
    }
  }
  return '';
}
