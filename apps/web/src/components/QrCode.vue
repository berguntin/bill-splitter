<script setup lang="ts">
import QRCode from 'qrcode';
import { ref, watchEffect } from 'vue';

const props = defineProps<{ value: string; label: string }>();
const svg = ref('');

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

watchEffect(async () => {
  // The library returns a self-contained SVG built from the URL only, never user HTML.
  svg.value = await QRCode.toString(props.value, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: token('--color-qr-dark'), light: token('--color-qr-light') },
  });
});
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div role="img" :aria-label="label" class="aspect-square w-full [&>svg]:size-full" v-html="svg" />
</template>
