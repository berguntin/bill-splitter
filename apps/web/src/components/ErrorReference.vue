<script setup lang="ts">
import { computed } from 'vue';
import { formatReference } from '@/lib/diagnostics';

const props = defineProps<{ requestId: string }>();
const reference = computed(() => formatReference(props.requestId));
</script>

<template>
  <!-- Quoted in bug reports to find the request in the API's logs. -->
  <p class="text-xs opacity-70">
    Ref. <span class="font-mono tracking-wide select-all">{{ reference }}</span>
  </p>
</template>
