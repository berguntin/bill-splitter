import '@fontsource-variable/plus-jakarta-sans';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './assets/main.css';

const app = createApp(App);
// Pinia must be installed before the router, whose guards read the store.
app.use(createPinia());
app.use(router);
app.mount('#app');
