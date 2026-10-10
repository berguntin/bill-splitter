<script setup lang="ts">
import type { Diner } from '@bill-splitter/core';
import { computed } from 'vue';
import { initial } from '@/lib/format';
import { dinerSwatch } from '@/lib/palette';

const props = withDefaults(defineProps<{ diner: Diner; size?: number }>(), { size: 40 });

const style = computed(() => {
  const swatch = dinerSwatch(props.diner.color);
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    fontSize: `${Math.round(props.size * 0.4)}px`,
    backgroundColor: swatch.fill,
    color: swatch.ink,
  };
});
</script>

<template>
  <span
    class="flex shrink-0 items-center justify-center rounded-full font-bold"
    :style="style"
    aria-hidden="true"
  >
    {{ initial(diner.name) }}
  </span>
</template>
