<script setup lang="ts">
import { Languages, SlidersHorizontal } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import BrandMark from './BrandMark.vue'

const { locale } = useI18n()
const router = useRouter()

function toggleLocale(): void {
  locale.value = locale.value === 'nl' ? 'en' : 'nl'
  localStorage.setItem('kindy.locale', locale.value)
  document.documentElement.lang = locale.value
}
</script>

<template>
  <header class="view-header">
    <BrandMark compact />
    <div class="header-actions">
      <button class="icon-button" :aria-label="$t('common.language')" @click="toggleLocale">
        <span class="language-code">{{ locale.toLocaleUpperCase() }}</span>
        <Languages :size="18" />
      </button>
      <button
        class="icon-button"
        :aria-label="$t('common.settings')"
        @click="router.push('/settings')"
      >
        <SlidersHorizontal :size="22" />
      </button>
    </div>
  </header>
</template>
