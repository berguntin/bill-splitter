<script setup lang="ts">
defineProps<{ checked: boolean }>();
</script>

<template>
  <span
    class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition"
    :class="checked ? 'bg-accent border-accent text-accent-ink' : 'border-line bg-surface-raised'"
    aria-hidden="true"
  >
    <svg v-if="checked" width="14" height="14" viewBox="0 0 24 24">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </span>
</template>
