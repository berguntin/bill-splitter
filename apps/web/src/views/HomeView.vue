<script setup lang="ts">
import { useBillStore } from '@/stores/bill';

const bill = useBillStore();
</script>

<template>
  <main class="flex flex-1 flex-col justify-between py-10">
    <header class="space-y-3">
      <p class="text-accent text-sm font-semibold tracking-wide uppercase">Bill Splitter</p>
      <h1 class="text-4xl leading-tight font-bold tracking-tight">
        Split the bill,<br />not the friendship.
      </h1>
      <p class="text-ink-muted text-lg">
        Snap the receipt, tap who had what, and everyone knows what they owe.
      </p>
    </header>

    <section class="space-y-3" aria-label="Start a new bill">
      <button
        type="button"
        class="bg-accent text-accent-ink flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-lg font-semibold shadow-lg shadow-accent/25 transition active:scale-[0.98]"
        disabled
      >
        Scan receipt
        <span class="rounded-full bg-white/20 px-2 py-0.5 text-xs">Soon</span>
      </button>
      <button
        type="button"
        class="border-line bg-surface-raised w-full rounded-2xl border px-6 py-4 text-lg font-medium transition active:scale-[0.98]"
        @click="bill.reset()"
      >
        Enter items manually
      </button>
    </section>
  </main>
</template>
