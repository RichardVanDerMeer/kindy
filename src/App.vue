<script setup lang="ts">
import { onMounted } from 'vue'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import AgendaEditors from '@/components/AgendaEditors.vue'
import BottomNavigation from '@/components/BottomNavigation.vue'
import ConnectScreen from '@/components/ConnectScreen.vue'
import LockScreen from '@/components/LockScreen.vue'
import ToastHost from '@/components/ToastHost.vue'
import { useKindyStore } from '@/stores/kindy'
import { routeForDeepLink } from '@/router/deepLinks'
import { useSecurityStore } from '@/stores/security'
import { useWidgetStore } from '@/stores/widget'

const store = useKindyStore()
const security = useSecurityStore()
const route = useRoute()
const router = useRouter()
// Keeps the home-screen widget up to date for as long as the app runs.
useWidgetStore()

const tabRoots = new Set(['/', '/people', '/circles', '/upcoming'])

/**
 * Android's Back, as in native apps: close an open sheet first, then go back
 * one screen; from another tab return to Home; on Home leave the app.
 */
function handleBack(): void {
  const sheets = document.querySelectorAll<HTMLElement>('.dialog-backdrop')
  const sheet = sheets[sheets.length - 1]
  if (sheet) {
    // Sheets close on a tap on their backdrop.
    sheet.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return
  }
  if (route.path === '/') {
    void CapacitorApp.minimizeApp()
    return
  }
  if (tabRoots.has(route.path)) {
    void router.replace('/')
    return
  }
  // Opened straight from a widget or link: there is nothing in the app to go back to.
  if (window.history.state?.back) router.back()
  else void router.replace('/')
}

/** Widget taps arrive as kindy:// links; unknown links are ignored. */
function openDeepLink(url: string | undefined): void {
  const target = url ? routeForDeepLink(url) : null
  if (target) void router.push(target)
}
const { t } = useI18n()

onMounted(async () => {
  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener('appUrlOpen', (event) => openDeepLink(event.url))
    void CapacitorApp.addListener('backButton', handleBack)
    void CapacitorApp.getLaunchUrl().then((launch) => openDeepLink(launch?.url))
  }
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
    <div
      class="activity-bar"
      :class="{ 'activity-bar--active': store.busy }"
      aria-hidden="true"
    ></div>
    <div v-if="!security.ready" class="center-state" role="status">
      <span class="loading-orbit"></span>
      <p>{{ t('security.checking') }}</p>
    </div>
    <LockScreen v-else-if="security.locked" :busy="security.authenticating" @unlock="unlock" />
    <ConnectScreen v-else-if="!store.account" />
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
    <RouterView v-else v-slot="{ Component }">
      <Transition name="view" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
    <AgendaEditors v-if="store.initialized" />
    <ToastHost />
    <BottomNavigation
      v-if="
        security.ready && !security.locked && store.account && route.meta.showNavigation !== false
      "
    />
  </main>
</template>
