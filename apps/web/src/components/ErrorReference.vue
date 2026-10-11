<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatReference } from '@/lib/diagnostics';

const props = defineProps<{ requestId: string }>();
const reference = computed(() => formatReference(props.requestId));
const { t } = useI18n();
</script>

<template>
  <!-- Quoted in bug reports to find the request in the API's logs. -->
  <p class="text-xs opacity-70">
    {{ t('common.reference') }}
    <span class="font-mono tracking-wide select-all">{{ reference }}</span>
  </p>
</template>
