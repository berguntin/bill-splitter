import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import type { Logger } from './logger';
import { REQUEST_ID_HEADER, requestIdFrom } from './requestId';

/**
 * Logs one line per request with its id, status and latency. The id is echoed
 * in a response header so the web app can show it next to an error.
 */
export function httpLogger(logger: Logger) {
  return pinoHttp<IncomingMessage, ServerResponse>({
    logger,
    genReqId(req, res) {
      const id = requestIdFrom(req.headers[REQUEST_ID_HEADER.toLowerCase()]);
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    // Uptime monitors hit the health check every minute; those lines are noise.
    autoLogging: { ignore: (req) => req.url === '/api/health' },
    customLogLevel(_req, res, error) {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Only what is needed to find a request: no headers, IP addresses or bodies.
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        // Attachment links carry their access token in the query string.
        url: req.url.replace(/([?&]token=)[^&]*/, '$1[redacted]'),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
