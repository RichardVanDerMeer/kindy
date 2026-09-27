<script setup lang="ts">
import {
  Apple,
  ArrowLeft,
  CloudUpload,
  DatabaseBackup,
  ContactRound,
  FileSpreadsheet,
  Languages,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
} from '@lucide/vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import RestoreBackupDialog from '@/components/RestoreBackupDialog.vue'
import { supportedLocales, useLocaleSetting } from '@/composables/useLocaleSetting'
import { useKindyStore } from '@/stores/kindy'
import { useSecurityStore } from '@/stores/security'

const router = useRouter()
const security = useSecurityStore()
const store = useKindyStore()
const { locale, setLocale } = useLocaleSetting()
const showRestore = ref(false)

function formatBackupDate(value: number): string {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(
    value,
  )
}
const savingLock = ref(false)
const isDev = import.meta.env.DEV

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

    <h2 class="section-title">{{ $t('settings.general') }}</h2>
    <article class="card settings-card">
      <div class="settings-card__icon"><Languages :size="24" /></div>
      <div class="settings-card__copy">
        <h2>{{ $t('settings.language') }}</h2>
        <p>{{ $t('settings.languageHint') }}</p>
      </div>
      <div class="segmented" role="radiogroup" :aria-label="$t('settings.language')">
        <button
          v-for="option in supportedLocales"
          :key="option.code"
          role="radio"
          :aria-checked="locale === option.code"
          :class="{ active: locale === option.code }"
          @click="setLocale(option.code)"
        >
          {{ option.label }}
        </button>
      </div>
    </article>

    <h2 class="section-title">{{ $t('settings.security') }}</h2>
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

    <h2 class="section-title">{{ $t('backup.section') }}</h2>
    <article class="card settings-card">
      <div class="settings-card__icon"><DatabaseBackup :size="24" /></div>
      <div class="settings-card__copy">
        <h2>{{ $t('backup.title') }}</h2>
        <p>{{ $t('backup.hint') }}</p>
      </div>
      <span />
      <div class="settings-card__footer settings-card__footer--sync" role="status">
        <CloudUpload :size="17" />
        <span v-if="store.backupState === 'running'">{{ $t('backup.running') }}</span>
        <span v-else-if="store.backupState === 'not-connected'">{{
          $t('backup.notConnected')
        }}</span>
        <span v-else-if="store.backupState === 'failed'" class="form-error">{{
          $t('backup.failed')
        }}</span>
        <span v-else-if="store.lastBackupAt">{{
          $t('backup.lastBackup', { date: formatBackupDate(store.lastBackupAt) })
        }}</span>
        <span v-else>{{ $t('backup.never') }}</span>
      </div>
      <p class="settings-note">{{ $t('backup.privacy') }}</p>
      <div class="settings-actions">
        <button
          class="button button--ghost"
          :disabled="store.backupState === 'running' || !store.people.length"
          @click="store.backupNow()"
        >
          {{ $t('backup.backupNow') }}
        </button>
        <button class="button button--ghost" @click="showRestore = true">
          {{ $t('backup.restore') }}
        </button>
      </div>
    </article>
    <RestoreBackupDialog
      :open="showRestore"
      @close="showRestore = false"
      @restored="showRestore = false"
    />

    <h2 class="section-title">{{ $t('settings.sources') }}</h2>
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
      <div class="settings-subrow">
        <span class="settings-subrow__copy">
          <strong>{{ $t('settings.writeBack') }}</strong>
          <small>{{ $t('settings.writeBackHint') }}</small>
        </span>
        <button
          class="switch"
          role="switch"
          :aria-checked="store.googleWriteBack"
          :aria-label="$t('settings.writeBack')"
          @click="store.setGoogleWriteBack(!store.googleWriteBack)"
        >
          <span />
        </button>
      </div>
      <div v-if="store.googleLinked" class="settings-card__footer settings-card__footer--sync">
        <CloudUpload :size="17" />
        <span>{{
          $t('settings.pendingCount', { count: store.pendingSyncCount }, store.pendingSyncCount)
        }}</span>
        <button
          v-if="store.pendingSyncCount"
          class="section-link"
          :disabled="store.googleSyncing"
          @click="store.retryContactSync()"
        >
          {{ $t('settings.syncNow') }}
        </button>
      </div>
      <button
        class="button button--ghost settings-wide-button"
        @click="router.push({ path: '/people', query: { import: 'google' } })"
      >
        {{ $t('settings.connectGoogle') }}
      </button>
    </article>

    <article class="card settings-card settings-card--soon">
      <div class="settings-card__icon"><Apple :size="24" /></div>
      <div class="settings-card__copy">
        <div class="settings-title-row">
          <h2>{{ $t('settings.appleContacts') }}</h2>
          <span class="status-pill status-pill--muted">{{ $t('settings.comingSoon') }}</span>
        </div>
        <p>{{ $t('settings.appleContactsHint') }}</p>
      </div>
    </article>

    <article class="card settings-card settings-card--soon">
      <div class="settings-card__icon"><FileSpreadsheet :size="24" /></div>
      <div class="settings-card__copy">
        <div class="settings-title-row">
          <h2>{{ $t('settings.fileImport') }}</h2>
          <span class="status-pill status-pill--muted">{{ $t('settings.comingSoon') }}</span>
        </div>
        <p>{{ $t('settings.fileImportHint') }}</p>
      </div>
    </article>

    <template v-if="isDev">
      <h2 class="section-title">{{ $t('settings.developer') }}</h2>
      <article class="card settings-card">
        <div class="settings-card__icon"><RotateCcw :size="24" /></div>
        <div class="settings-card__copy">
          <h2>{{ $t('settings.resetDemo') }}</h2>
          <p>{{ $t('settings.resetDemoHint') }}</p>
        </div>
        <button class="button button--ghost settings-wide-button" @click="store.resetDemoData">
          {{ $t('settings.resetDemo') }}
        </button>
      </article>
    </template>
  </section>
</template>
