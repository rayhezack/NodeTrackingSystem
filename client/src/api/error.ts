export function toReadableError(error: unknown, fallbackMessage: string): Error {
  const responseData = (error as { response?: { data?: unknown } })?.response?.data;
  const backendMessage = extractMessage(responseData);
  if (backendMessage) {
    return new Error(backendMessage);
  }

  const originalMessage = error instanceof Error ? error.message : '';
  return new Error(originalMessage || fallbackMessage);
}

function extractMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const payload = data as Record<string, unknown>;
  const candidates = [payload.message, payload.error];
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
