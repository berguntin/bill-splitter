import '@fontsource-variable/plus-jakarta-sans';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './lib/i18n';
import { installDiagnostics } from './lib/installDiagnostics';
import { initMonitoring } from './lib/monitoring';
import { installUpdateReload } from './lib/updateReload';
import { router } from './router';
import { useHistoryStore } from './stores/history';
import { useShareStore } from './stores/share';
import './assets/main.css';

const app = createApp(App);
// Pinia must be installed before the router, whose guards read the store.
app.use(createPinia());
app.use(router);
app.use(i18n);
installDiagnostics(app, router);
installUpdateReload(router);
// Keep a shared bill in sync and the recent bills saved from any screen, also after a reload.
useShareStore();
useHistoryStore();
app.mount('#app');
void initMonitoring(app, router);
