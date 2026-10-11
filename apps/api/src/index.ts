import { createApp } from './app';
import { loadConfig } from './config';
import { createDependencies } from './dependencies';
import { createLogger } from './observability/logger';

const config = loadConfig();
const logger = createLogger(config);
const dependencies = await createDependencies(config, logger);

const server = createApp(config, dependencies).listen(config.PORT, () => {
  logger.info(
    `API listening on http://localhost:${config.PORT} ` +
      `(receipts: ${config.RECEIPT_PARSER}, bills: ${config.MONGODB_URI ? 'mongodb' : 'memory'})`,
  );
});

// Crashes outside a request still leave a structured trace before the process exits.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});

// Let in-flight requests finish and close the database connection on shutdown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => void dependencies.billStore.close().finally(() => process.exit(0)));
  });
}
