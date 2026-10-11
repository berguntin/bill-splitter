<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppIcon from '@/components/AppIcon.vue';
import DinerAvatar from '@/components/DinerAvatar.vue';
import StepHeader from '@/components/StepHeader.vue';
import { useBillStore } from '@/stores/bill';

const store = useBillStore();
const { t } = useI18n();
const name = ref('');

const suggestions = computed(() => {
  const taken = new Set(store.bill.diners.map((diner) => diner.name.toLowerCase()));
  return store.recentNames.filter((candidate) => !taken.has(candidate.toLowerCase()));
});

const count = computed(() => store.bill.diners.length);

function add(): void {
  if (store.addDiner(name.value)) name.value = '';
}
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-6 pt-14">
    <StepHeader :title="t('diners.title')" :step="t('diners.step')" :back="{ name: 'items' }" />

    <form class="flex gap-2" @submit.prevent="add">
      <label class="flex-1">
        <span class="sr-only">{{ t('diners.name') }}</span>
        <input
          v-model="name"
          class="field h-13.5"
          type="text"
          :placeholder="t('diners.placeholder')"
          autocomplete="off"
          enterkeyhint="done"
        />
      </label>
      <button
        type="submit"
        class="bg-inverse text-inverse-ink flex size-13.5 shrink-0 items-center justify-center rounded-2xl"
        :aria-label="t('diners.add')"
      >
        <AppIcon name="plus" :size="22" />
      </button>
    </form>

    <ul v-if="count" class="flex flex-col gap-2.5" :aria-label="t('diners.list')">
      <li
        v-for="diner in store.bill.diners"
        :key="diner.id"
        class="card flex items-center gap-3.5 py-2.5 pr-2.5 pl-3"
      >
        <DinerAvatar :diner="diner" />
        <span class="flex-1 text-base font-semibold">{{ diner.name }}</span>
        <button
          type="button"
          class="text-ink-muted flex size-11 items-center justify-center rounded-xl"
          :aria-label="t('diners.remove', { name: diner.name })"
          @click="store.removeDiner(diner.id)"
        >
          <AppIcon name="close" :size="18" />
        </button>
      </li>
    </ul>

    <section v-if="suggestions.length" class="flex flex-col gap-2.5" aria-labelledby="recent">
      <h2 id="recent" class="section-label">{{ t('diners.recent') }}</h2>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="suggestion in suggestions"
          :key="suggestion"
          type="button"
          class="border-line bg-surface-raised h-10 rounded-full border px-4 text-sm font-semibold"
          @click="store.addDiner(suggestion)"
        >
          + {{ suggestion }}
        </button>
      </div>
    </section>

    <div class="bg-surface sticky bottom-0 mt-auto pt-3 pb-8">
      <RouterLink v-if="count" :to="{ name: 'assign' }" class="btn-primary">
        {{ t('diners.continue', { n: count }, count) }}
      </RouterLink>
      <button v-else type="button" class="btn-primary" disabled>{{ t('diners.addOne') }}</button>
    </div>
  </main>
</template>
