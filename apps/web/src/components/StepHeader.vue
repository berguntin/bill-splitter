<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { RouterLink, useRoute } from 'vue-router';
import { reportLocation } from '@/lib/reportContext';
import AppIcon from './AppIcon.vue';

defineProps<{
  title: string;
  step?: string;
  back: RouteLocationRaw;
  /** Hides the "Report a problem" button, e.g. on the report screen itself. */
  hideReport?: boolean;
}>();

const route = useRoute();
</script>

<template>
  <header class="flex items-center gap-3">
    <RouterLink :to="back" class="icon-btn" aria-label="Back">
      <AppIcon name="back" />
    </RouterLink>
    <div class="flex min-w-0 flex-1 flex-col">
      <span v-if="step" class="text-ink-muted text-[13px] font-semibold">{{ step }}</span>
      <h1 class="truncate text-[22px] font-extrabold tracking-tight">{{ title }}</h1>
    </div>
    <slot name="actions" />
    <RouterLink
      v-if="!hideReport"
      :to="reportLocation(route.fullPath)"
      class="text-ink-muted -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
      aria-label="Report a problem"
      title="Report a problem"
    >
      <AppIcon name="flag" :size="18" />
    </RouterLink>
  </header>
</template>
