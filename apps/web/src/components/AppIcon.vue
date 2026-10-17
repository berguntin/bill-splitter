<script setup lang="ts">
/**
 * Stroke icons used across the app. Decorative by default; give the parent
 * control an `aria-label` when the icon is its only content.
 */
export type IconName =
  | 'back'
  | 'close'
  | 'plus'
  | 'minus'
  | 'undo'
  | 'check'
  | 'chevron-down'
  | 'copy'
  | 'share'
  | 'scan'
  | 'split'
  | 'warning'
  | 'qr'
  | 'flag'
  | 'image'
  | 'link';

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-if="name === 'back'" d="M15 18l-6-6 6-6" />
    <path v-else-if="name === 'close'" d="M6 6l12 12M18 6L6 18" />
    <path v-else-if="name === 'plus'" d="M12 5v14M5 12h14" />
    <path v-else-if="name === 'minus'" d="M5 12h14" />
    <template v-else-if="name === 'undo'">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </template>
    <template v-else-if="name === 'check'">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </template>
    <path v-else-if="name === 'chevron-down'" d="M6 9l6 6 6-6" />
    <template v-else-if="name === 'copy'">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </template>
    <template v-else-if="name === 'share'">
      <path d="M12 3v13" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </template>
    <template v-else-if="name === 'scan'">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3.5" />
    </template>
    <template v-else-if="name === 'split'">
      <path d="M12 3v6" />
      <path d="M12 9l-6 6v6" />
      <path d="M12 9l6 6v6" />
    </template>
    <template v-else-if="name === 'qr'">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </template>
    <template v-else-if="name === 'link'">
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </template>
    <template v-else-if="name === 'flag'">
      <path d="M5 21V4" />
      <path d="M5 4h12l-2.5 4.5L17 13H5" />
    </template>
    <template v-else-if="name === 'image'">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="M21 16l-5-5-9 9" />
    </template>
    <template v-else-if="name === 'warning'">
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v4M12 17.5v.01" />
    </template>
  </svg>
</template>
