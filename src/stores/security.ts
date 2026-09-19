import { App } from '@capacitor/app'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { getSecurityGateway } from '@/infrastructure/security/securityGateway'
import { useKindyStore } from '@/stores/kindy'

const LOCK_AFTER_MS = 5 * 60 * 1000
const gateway = getSecurityGateway()

export const useSecurityStore = defineStore('security', () => {
  const ready = ref(false)
  const available = ref(false)
  const enabled = ref(false)
  const locked = ref(false)
  const authenticating = ref(false)
  let backgroundedAt: number | null = null
  let lifecycleRegistered = false

  async function initialize(): Promise<void> {
    available.value = await gateway.availability()
    enabled.value = available.value && (await gateway.isAppLockEnabled())
    locked.value = enabled.value
    ready.value = true
  }

  async function unlock(): Promise<boolean> {
    if (!enabled.value) {
      locked.value = false
      return true
    }

    authenticating.value = true
    try {
      const authenticated = await gateway.authenticate()
      if (authenticated) locked.value = false
      return authenticated
    } finally {
      authenticating.value = false
    }
  }

  async function setEnabled(value: boolean): Promise<boolean> {
    if (value && !(await gateway.authenticate())) return false
    await gateway.setAppLockEnabled(value)
    enabled.value = value
    return true
  }

  async function lock(): Promise<void> {
    if (!enabled.value || locked.value) return
    locked.value = true
    await useKindyStore().lock()
  }

  async function observeLifecycle(): Promise<void> {
    if (lifecycleRegistered) return
    lifecycleRegistered = true
    await App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) {
        backgroundedAt = Date.now()
        return
      }

      const backgroundDuration = backgroundedAt === null ? 0 : Date.now() - backgroundedAt
      backgroundedAt = null
      if (backgroundDuration >= LOCK_AFTER_MS) await lock()
    })
  }

  return {
    ready,
    available,
    enabled,
    locked,
    authenticating,
    initialize,
    unlock,
    setEnabled,
    lock,
    observeLifecycle,
  }
})
