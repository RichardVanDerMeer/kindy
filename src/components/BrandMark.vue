<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <div class="brand" :class="{ 'brand--compact': compact }" aria-label="Kindy">
    <span class="brand-symbol" aria-hidden="true">
      <span class="brand-symbol__coral"></span>
      <span class="brand-symbol__lavender"></span>
      <span class="brand-symbol__mint"></span>
    </span>
    <span class="brand__name">Kindy</span>
  </div>
</template>
