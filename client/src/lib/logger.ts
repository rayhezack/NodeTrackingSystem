/* eslint-disable no-restricted-syntax -- PolloCloud does not provide the Miaoda logger runtime. */

type LogMethod = (...args: unknown[]) => void;

export const logger: Record<'debug' | 'info' | 'warn' | 'error', LogMethod> = {
  debug: (...args) => console.debug(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
