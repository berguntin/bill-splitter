import { pino, type Logger } from 'pino';
import type { Config } from '../config';

export type { Logger } from 'pino';

/**
 * JSON lines on hosts (searchable in their log viewer), readable colored lines
 * in a development terminal, nothing in tests. Secrets are redacted.
 */
export function createLogger(config: Pick<Config, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  const level = config.LOG_LEVEL ?? (config.NODE_ENV === 'test' ? 'silent' : 'info');
  return pino({
    level,
    base: { service: 'api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['req.headers.authorization', 'req.headers.cookie', '*.ownerToken'],
    // Hosts pipe stdout, so pretty printing only kicks in for a local terminal.
    ...(config.NODE_ENV === 'development' && process.stdout.isTTY
      ? { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname,service' } } }
      : {}),
  });
}
