<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <div
    class="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
  >
    <RouterView />
  </div>
</template>
