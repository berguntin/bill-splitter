<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppIcon from '@/components/AppIcon.vue';
import { SUPPORT_URL } from '@/lib/support';

const { t } = useI18n();
</script>

<template>
  <a
    v-if="SUPPORT_URL"
    :href="SUPPORT_URL"
    target="_blank"
    rel="noopener noreferrer"
    class="card flex items-center gap-3 px-4 py-3"
    data-testid="support-link"
  >
    <span
      class="bg-accent/10 text-accent-text flex size-9 shrink-0 items-center justify-center rounded-full"
    >
      <AppIcon name="coffee" :size="18" />
    </span>
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="text-sm font-bold">{{ t('support.title') }}</span>
      <span class="text-ink-muted text-[13px]">{{ t('support.text') }}</span>
    </span>
    <span class="text-accent-text shrink-0 text-sm font-bold">{{ t('support.cta') }}</span>
    <span class="sr-only">{{ t('support.opensNewTab') }}</span>
  </a>
</template>
