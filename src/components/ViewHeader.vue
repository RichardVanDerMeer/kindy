<script setup lang="ts">
import { SlidersHorizontal } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import BrandMark from './BrandMark.vue'

const { locale } = useI18n()

function toggleLocale(): void {
  locale.value = locale.value === 'nl' ? 'en' : 'nl'
  localStorage.setItem('kindy.locale', locale.value)
  document.documentElement.lang = locale.value
}
</script>

<template>
  <header class="view-header">
    <BrandMark compact />
    <button class="icon-button" :aria-label="$t('common.language')" @click="toggleLocale">
      <span class="language-code">{{ locale.toLocaleUpperCase() }}</span>
      <SlidersHorizontal :size="20" />
    </button>
  </header>
</template>
