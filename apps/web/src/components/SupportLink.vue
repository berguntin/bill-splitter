<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppIcon from '@/components/AppIcon.vue';
import { money } from '@/lib/format';
import { coffeeSplit, SUPPORT_URL } from '@/lib/support';

const props = withDefaults(
  defineProps<{
    /** `inline` is a one-line text link for footers. */
    variant?: 'card' | 'inline';
    /** With two or more people, the card shows what one coffee costs each. */
    people?: number;
    currency?: string;
  }>(),
  { variant: 'card', people: 0, currency: 'EUR' },
);

const { t } = useI18n();

const split = computed(() => {
  if (props.people < 2) return null;
  const { amount, share, exact } = coffeeSplit(props.people);
  const params = {
    amount: money(amount, props.currency),
    n: props.people,
    share: money(share, props.currency),
  };
  return exact ? t('support.splitText', params) : t('support.splitTextApprox', params);
});
</script>

<template>
  <template v-if="SUPPORT_URL">
    <a
      v-if="variant === 'inline'"
      :href="SUPPORT_URL"
      target="_blank"
      rel="noopener noreferrer"
      class="text-accent-text flex items-center justify-center gap-1.5 text-[13px] font-bold"
      data-testid="support-link"
    >
      <AppIcon name="coffee" :size="16" />
      {{ t('support.inline') }}
      <span class="sr-only">{{ t('support.opensNewTab') }}</span>
    </a>
    <a
      v-else
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
        <span class="text-sm font-bold">
          {{ split ? t('support.splitTitle') : t('support.title') }}
        </span>
        <span class="text-ink-muted text-[13px]">{{ split ?? t('support.text') }}</span>
      </span>
      <span class="text-accent-text shrink-0 text-sm font-bold">{{ t('support.cta') }}</span>
      <span class="sr-only">{{ t('support.opensNewTab') }}</span>
    </a>
  </template>
</template>
