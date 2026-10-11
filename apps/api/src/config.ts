import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    /** Hops of reverse proxies in front of the API, so rate limits see real client IPs. */
    TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
    ANTHROPIC_API_KEY: optionalString,
    /** `claude` reads receipts with the Claude API; `fake` returns a sample receipt. */
    RECEIPT_PARSER: z.enum(['claude', 'fake']).optional(),
    /** Receipt scans allowed per client IP every 10 minutes. */
    RECEIPT_RATE_LIMIT: z.coerce.number().int().positive().default(20),
    /** MongoDB connection string for shared bills. Without it, bills live in memory. */
    MONGODB_URI: optionalString,
    /** Database for shared bills, so connection strings without one (as Atlas gives) work. */
    MONGODB_DATABASE: z.string().trim().min(1).default('bill-splitter'),
    /** Days a shared bill is kept after its last update. */
    BILL_TTL_DAYS: z.coerce.number().positive().default(7),
    /** Days a bug report and its photos are kept. */
    REPORT_TTL_DAYS: z.coerce.number().positive().default(90),
    /** Fine-grained token with "Issues: read and write", to open an issue per bug report. */
    GITHUB_TOKEN: optionalString,
    /** Repository for those issues, as `owner/name`. */
    GITHUB_REPOSITORY: z
      .string()
      .trim()
      .regex(/^[\w.-]+\/[\w.-]+$/)
      .default('berguntin/bill-splitter'),
    /** Sentry project DSN. Without it, errors are only logged. */
    SENTRY_DSN: optionalString,
    /** Environment name shown in Sentry; defaults to NODE_ENV. */
    SENTRY_ENVIRONMENT: optionalString,
    /** Version of the running code. Railway sets RAILWAY_GIT_COMMIT_SHA. */
    RELEASE: optionalString,
    RAILWAY_GIT_COMMIT_SHA: optionalString,
    /** Minimum log level. Defaults to `info`, and to `silent` in tests. */
    LOG_LEVEL: z.preprocess(
      (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    ),
  })
  .transform((config, context) => {
    const receiptParser = config.RECEIPT_PARSER ?? (config.ANTHROPIC_API_KEY ? 'claude' : 'fake');
    if (receiptParser === 'claude' && !config.ANTHROPIC_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required when RECEIPT_PARSER is "claude"',
      });
    }
    if (receiptParser === 'fake' && config.NODE_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        path: ['RECEIPT_PARSER'],
        message: 'The fake receipt parser cannot run in production; set ANTHROPIC_API_KEY',
      });
    }
    if (!config.MONGODB_URI && config.NODE_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI is required in production; shared bills would be lost on restart',
      });
    }
    const { RAILWAY_GIT_COMMIT_SHA: commit, ...rest } = config;
    return { ...rest, RELEASE: config.RELEASE ?? commit, RECEIPT_PARSER: receiptParser };
  });

export type Config = z.infer<typeof schema>;

/** Reads and validates configuration from the environment, failing fast on bad values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
