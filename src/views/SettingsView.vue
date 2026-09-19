<script setup lang="ts">
import { ArrowLeft, ContactRound, LockKeyhole, ShieldCheck } from '@lucide/vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useSecurityStore } from '@/stores/security'

const router = useRouter()
const security = useSecurityStore()
const savingLock = ref(false)

async function toggleLock(): Promise<void> {
  savingLock.value = true
  try {
    await security.setEnabled(!security.enabled)
  } finally {
    savingLock.value = false
  }
}
</script>

<template>
  <section class="view settings-view">
    <header class="profile-toolbar settings-toolbar">
      <button class="icon-button" :aria-label="$t('common.back')" @click="router.back()">
        <ArrowLeft :size="24" />
      </button>
      <h1>{{ $t('settings.title') }}</h1>
      <span class="toolbar-spacer" />
    </header>

    <article class="card settings-card">
      <div class="settings-card__icon"><LockKeyhole :size="24" /></div>
      <div class="settings-card__copy">
        <h2>{{ $t('settings.appLock') }}</h2>
        <p>{{ $t('settings.appLockHint') }}</p>
      </div>
      <button
        class="switch"
        role="switch"
        :aria-checked="security.enabled"
        :aria-label="$t('settings.appLock')"
        :disabled="!security.available || savingLock"
        @click="toggleLock"
      >
        <span />
      </button>
      <div class="settings-card__footer">
        <ShieldCheck :size="17" />
        <span>{{ $t('settings.lockDelay') }}</span>
      </div>
    </article>

    <article class="card settings-card settings-card--google">
      <div class="settings-card__icon settings-card__icon--google"><ContactRound :size="24" /></div>
      <div class="settings-card__copy">
        <div class="settings-title-row">
          <h2>{{ $t('settings.googleContacts') }}</h2>
          <span class="status-pill">{{ $t('settings.readOnly') }}</span>
        </div>
        <p>{{ $t('settings.googleContactsHint') }}</p>
      </div>
      <ul class="privacy-list">
        <li>{{ $t('settings.googleReadOnly') }}</li>
        <li>{{ $t('settings.googleChoose') }}</li>
        <li>{{ $t('settings.googleLocalCopy') }}</li>
      </ul>
      <button
        class="button button--ghost settings-wide-button"
        @click="router.push('/?import=google')"
      >
        {{ $t('settings.connectGoogle') }}
      </button>
    </article>
  </section>
</template>
