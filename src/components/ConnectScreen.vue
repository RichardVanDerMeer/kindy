<script setup lang="ts">
import { ref } from 'vue'
import { ContactRound, LoaderCircle } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import BrandMark from '@/components/BrandMark.vue'
import { useKindyStore } from '@/stores/kindy'

/** Shown while no Google account is connected: Kindy has no data without one (ADR 0005). */
const store = useKindyStore()
const { t } = useI18n()
const connecting = ref(false)
const error = ref('')

async function connect(): Promise<void> {
  connecting.value = true
  error.value = ''
  try {
    await store.connectGoogle()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    connecting.value = false
  }
}
</script>

<template>
  <section class="connect-screen">
    <BrandMark />
    <article class="card welcome-card">
      <h1>{{ t('home.connectTitle') }}</h1>
      <p>{{ t('home.connectText') }}</p>
      <button
        class="button button--primary settings-wide-button"
        :disabled="connecting"
        @click="connect"
      >
        <LoaderCircle v-if="connecting" class="spin-icon" :size="18" />
        <ContactRound v-else :size="18" />
        {{ t('home.connectButton') }}
      </button>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <small class="muted">{{ t('home.connectPerAccount') }}</small>
    </article>
  </section>
</template>
