import { createRouter, createWebHistory } from 'vue-router';
import { useBillStore } from '@/stores/bill';
import HomeView from '@/views/HomeView.vue';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/scan', name: 'scan', component: () => import('@/views/ScanView.vue') },
    { path: '/bill/items', name: 'items', component: () => import('@/views/ItemsView.vue') },
    { path: '/bill/people', name: 'diners', component: () => import('@/views/DinersView.vue') },
    {
      path: '/bill/assign',
      name: 'assign',
      component: () => import('@/views/AssignView.vue'),
      meta: { needsItemsAndDiners: true },
    },
    {
      path: '/bill/summary',
      name: 'summary',
      component: () => import('@/views/SummaryView.vue'),
      meta: { needsItemsAndDiners: true },
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

// Deep links and reloads can land on a step whose data is not there yet.
router.beforeEach((to) => {
  if (!to.meta.needsItemsAndDiners) return true;
  const store = useBillStore();
  if (store.bill.items.length === 0) return { name: 'items' };
  if (store.bill.diners.length === 0) return { name: 'diners' };
  return true;
});

declare module 'vue-router' {
  interface RouteMeta {
    needsItemsAndDiners?: boolean;
  }
}
