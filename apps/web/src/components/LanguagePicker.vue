<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { LOCALE_NAMES, setLocale, SUPPORTED_LOCALES } from '@/lib/i18n';

const { t, locale } = useI18n();
</script>

<template>
  <div class="flex items-center gap-1 text-[13px]" role="group" :aria-label="t('common.language')">
    <template v-for="(code, index) in SUPPORTED_LOCALES" :key="code">
      <span v-if="index > 0" class="text-ink-muted" aria-hidden="true">·</span>
      <button
        type="button"
        class="rounded-md px-1.5 py-1 font-semibold"
        :class="locale === code ? 'text-ink' : 'text-ink-muted'"
        :lang="code"
        :aria-pressed="locale === code"
        @click="setLocale(code)"
      >
        {{ LOCALE_NAMES[code] }}
      </button>
    </template>
  </div>
</template>
