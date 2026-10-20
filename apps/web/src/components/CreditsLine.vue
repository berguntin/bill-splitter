<script setup lang="ts">
import { I18nT, useI18n } from 'vue-i18n';
import { AUTHOR_URL, HIRE_URL, SUPPORT_URL } from '@/lib/support';

const { t } = useI18n();
</script>

<template>
  <p class="text-ink-muted text-center text-[13px] leading-relaxed" data-testid="credits">
    <I18nT :keypath="SUPPORT_URL ? 'credits.line' : 'credits.lineNoCoffee'" scope="global">
      <template #author>
        <a :href="AUTHOR_URL" target="_blank" rel="noopener noreferrer" class="text-ink font-bold"
          >Berguntin</a
        >
      </template>
      <template v-if="SUPPORT_URL" #coffee>
        <a
          :href="SUPPORT_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="text-accent-text font-bold"
          >{{ t('credits.coffee') }}</a
        >
      </template>
      <template #hire>
        <a
          :href="HIRE_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="text-accent-text font-bold"
          >{{ t('credits.hire') }}</a
        >
      </template>
    </I18nT>
  </p>
</template>
