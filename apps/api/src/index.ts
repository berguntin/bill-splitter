import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();

createApp(config).listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});
