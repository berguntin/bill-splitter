/**
 * Root `build` script. On hosts that run it for one deployed service (Railway's
 * default), SERVICE=web or SERVICE=api builds only that app and skips type
 * checking, which CI already runs. Without SERVICE (CI, local) it builds every
 * package with its full `build` script.
 */
import { spawn } from 'node:child_process';

const COMMANDS = {
  web: ['--filter', '@bill-splitter/web', 'exec', 'vite', 'build'],
  api: ['--filter', '@bill-splitter/api', 'exec', 'tsup'],
};
const service = process.env.SERVICE;

if (service !== undefined && !COMMANDS[service]) {
  console.error(`SERVICE must be "web" or "api" (got ${JSON.stringify(service)}).`);
  process.exit(1);
}

const args = service ? COMMANDS[service] : ['-r', 'build'];
const child = spawn('pnpm', args, { stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
