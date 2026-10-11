import { createApp } from './app';
import { loadConfig } from './config';
import { createDependencies } from './dependencies';
import { createLogger } from './observability/logger';
import { flushSentry, initSentry } from './observability/sentry';

const config = loadConfig();
const logger = createLogger(config);
const sentry = initSentry(config);
const dependencies = await createDependencies(config, logger);

const server = createApp(config, dependencies).listen(config.PORT, () => {
  logger.info(
    `API listening on http://localhost:${config.PORT} ` +
      `(receipts: ${config.RECEIPT_PARSER}, bills: ${config.MONGODB_URI ? 'mongodb' : 'memory'}, ` +
      `sentry: ${sentry ? 'on' : 'off'}, release: ${config.RELEASE ?? 'unknown'})`,
  );
});

// Crashes outside a request still leave a structured trace before the process exits.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  // Sentry captures it too; give it a moment to send before exiting.
  void flushSentry().finally(() => process.exit(1));
});

// Let in-flight requests finish and close the database connection on shutdown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(
      () =>
        void Promise.allSettled([dependencies.billStore.close(), flushSentry()]).finally(() =>
          process.exit(0),
        ),
    );
  });
}
