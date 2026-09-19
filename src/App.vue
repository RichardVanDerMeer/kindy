<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

import BottomNavigation from '@/components/BottomNavigation.vue'
import { useKindyStore } from '@/stores/kindy'

const store = useKindyStore()
const route = useRoute()
const { t } = useI18n()

onMounted(() => store.initialize())
</script>

<template>
  <div class="app-background" aria-hidden="true"></div>
  <main class="app-shell">
    <div v-if="store.loading && !store.initialized" class="center-state" role="status">
      <span class="loading-orbit"></span>
      <p>{{ t('common.loading') }}</p>
    </div>
    <div v-else-if="store.error" class="center-state" role="alert">
      <p>{{ store.error }}</p>
      <button class="button button--primary" @click="store.initialize">{{ t('common.retry') }}</button>
    </div>
    <RouterView v-else />
    <BottomNavigation v-if="route.meta.showNavigation !== false" />
  </main>
</template>
