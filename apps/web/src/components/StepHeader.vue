<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { RouterLink } from 'vue-router';
import AppIcon from './AppIcon.vue';

defineProps<{ title: string; step?: string; back: RouteLocationRaw }>();
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
  </header>
</template>
