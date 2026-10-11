import { createApp } from './app';
import { loadConfig } from './config';
import { createDependencies } from './dependencies';

const config = loadConfig();
const dependencies = await createDependencies(config);

const server = createApp(config, dependencies).listen(config.PORT, () => {
  console.log(
    `API listening on http://localhost:${config.PORT} ` +
      `(receipts: ${config.RECEIPT_PARSER}, bills: ${config.MONGODB_URI ? 'mongodb' : 'memory'})`,
  );
});

// Let in-flight requests finish and close the database connection on shutdown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => void dependencies.billStore.close().finally(() => process.exit(0)));
  });
}
