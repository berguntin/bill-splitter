import type { DinerId } from '@bill-splitter/core';
import { computed, ref, type Ref } from 'vue';

/** A row that can be picked: a diner, or a group of diners paying together. */
export interface PickableRow {
  key: string;
  dinerIds: DinerId[];
}

/** Picking people (or groups) who will pay together. */
export function usePayTogether(rows: Ref<PickableRow[]>) {
  const selecting = ref(false);
  const selected = ref<string[]>([]);

  const selectedDinerIds = computed(() =>
    rows.value.filter((row) => selected.value.includes(row.key)).flatMap((row) => row.dinerIds),
  );
  const canGroup = computed(() => selectedDinerIds.value.length >= 2);

  function start(): void {
    selecting.value = true;
    selected.value = [];
  }

  function stop(): void {
    selecting.value = false;
    selected.value = [];
  }

  function toggle(key: string): void {
    selected.value = selected.value.includes(key)
      ? selected.value.filter((candidate) => candidate !== key)
      : [...selected.value, key];
  }

  function isSelected(key: string): boolean {
    return selected.value.includes(key);
  }

  return { selecting, selectedDinerIds, canGroup, start, stop, toggle, isSelected };
}
