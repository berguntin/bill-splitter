/**
 * Production entry point for hosts that run the root `start` script (Railway's
 * default). Each deployed service sets SERVICE=web or SERVICE=api.
 */
import { spawn } from 'node:child_process';

const PACKAGES = { web: '@bill-splitter/web', api: '@bill-splitter/api' };
const service = process.env.SERVICE;
const packageName = PACKAGES[service];

if (!packageName) {
  console.error(
    `Set the SERVICE environment variable to "web" or "api" (got ${JSON.stringify(service)}).`,
  );
  process.exit(1);
}

const child = spawn('pnpm', ['--filter', packageName, 'start'], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
