<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

import BottomNavigation from '@/components/BottomNavigation.vue'
import LockScreen from '@/components/LockScreen.vue'
import { useKindyStore } from '@/stores/kindy'
import { useSecurityStore } from '@/stores/security'

const store = useKindyStore()
const security = useSecurityStore()
const route = useRoute()
const { t } = useI18n()

onMounted(async () => {
  await security.initialize()
  await security.observeLifecycle()
  if (!security.locked) await store.initialize()
})

async function unlock(): Promise<void> {
  if (await security.unlock()) await store.initialize()
}
</script>

<template>
  <div class="app-background" aria-hidden="true"></div>
  <main class="app-shell">
    <div v-if="!security.ready" class="center-state" role="status">
      <span class="loading-orbit"></span>
      <p>{{ t('security.checking') }}</p>
    </div>
    <LockScreen v-else-if="security.locked" :busy="security.authenticating" @unlock="unlock" />
    <div v-else-if="store.loading && !store.initialized" class="center-state" role="status">
      <span class="loading-orbit"></span>
      <p>{{ t('common.loading') }}</p>
    </div>
    <div v-else-if="store.error" class="center-state" role="alert">
      <p>{{ store.error }}</p>
      <button class="button button--primary" @click="store.initialize">
        {{ t('common.retry') }}
      </button>
    </div>
    <RouterView v-else />
    <BottomNavigation
      v-if="security.ready && !security.locked && route.meta.showNavigation !== false"
    />
  </main>
</template>
