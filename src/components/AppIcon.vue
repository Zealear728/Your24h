<script setup lang="ts">
defineProps<{ name: 'left' | 'right' | 'clock' | 'trash' | 'palette' | 'grip' | 'check' | 'pen' | 'arrow' | 'sun' | 'moon' | 'overview' }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-if="name === 'left'" d="m14 6-6 6 6 6" />
    <path v-else-if="name === 'right'" d="m10 6 6 6-6 6" />
    <g v-else-if="name === 'overview'"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h3M9 18h6" /></g>
    <g v-else-if="name === 'sun'"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></g>
    <path v-else-if="name === 'moon'" d="M20.5 13.2A8.6 8.6 0 0 1 10.8 3a8.6 8.6 0 1 0 9.7 10.2Z" />
    <g v-else-if="name === 'clock'"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></g>
    <g v-else-if="name === 'trash'"><path d="M4 6h16M9 6V3h6v3M7 6l1 15h8l1-15M10 10v7m4-7v7" /></g>
    <g v-else-if="name === 'palette'"><path d="M20.5 12a8.5 8.5 0 1 0-8.5 8.5h1c1.6 0 2.1-1.6 1.2-2.7-.7-.9-.4-2.2 1-2.3h1.6c2.2 0 3.7-1.5 3.7-3.5Z" /><circle cx="7.5" cy="10" r=".6" /><circle cx="11" cy="6.8" r=".6" /><circle cx="15.5" cy="8" r=".6" /></g>
    <path v-else-if="name === 'grip'" d="M9 7h.01M15 7h.01M9 12h.01M15 12h.01M9 17h.01M15 17h.01" stroke-width="3" />
    <path v-else-if="name === 'check'" d="m5 12 4 4L19 6" />
    <g v-else-if="name === 'pen'"><path d="m5 15 10-10 4 4L9 19l-5 1 1-5ZM13 7l4 4M5 15l4 4" /></g>
    <path v-else d="M5 12h14m-5-5 5 5-5 5" />
  </svg>
</template>
