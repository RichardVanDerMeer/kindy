<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CloudDownload, TriangleAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { BackupError } from '@/domain/backup'
import type { CloudBackupInfo } from '@/domain/ports'
import { useKindyStore } from '@/stores/kindy'

/** `connect` shows Google sign-in first, for a new phone that is not linked yet. */
const props = defineProps<{ open: boolean; connect?: boolean }>()
const emit = defineEmits<{ close: []; restored: [] }>()

const store = useKindyStore()
const { t, locale } = useI18n()
const state = ref<'searching' | 'found' | 'none' | 'restoring' | 'error'>('searching')
const backup = ref<CloudBackupInfo | null>(null)
const errorText = ref('')

/** Restoring over existing people replaces them, so that needs an explicit warning. */
const replacesData = computed(() => store.people.length > 0)

async function search(): Promise<void> {
  state.value = 'searching'
  try {
    backup.value = await store.findCloudBackup(props.connect)
    state.value = backup.value ? 'found' : 'none'
  } catch {
    errorText.value = t('backup.connectFailed')
    state.value = 'error'
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) void search()
  },
)

async function restore(): Promise<void> {
  if (!backup.value) return
  state.value = 'restoring'
  try {
    await store.restoreFromCloud(backup.value.id)
    emit('restored')
  } catch (caught) {
    errorText.value =
      caught instanceof BackupError && caught.reason === 'newer-version'
        ? t('backup.newerVersion')
        : t('backup.restoreFailed')
    state.value = 'error'
  }
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'long', timeStyle: 'short' }).format(
    value,
  )
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <div class="dialog" role="dialog" aria-modal="true" aria-live="polite">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ $t('backup.restoreTitle') }}</h2>

        <div v-if="state === 'searching' || state === 'restoring'" class="contacts-loading">
          <span class="loading-orbit"></span>
          <p>{{ state === 'searching' ? $t('backup.searching') : $t('backup.restoring') }}</p>
        </div>

        <template v-else-if="state === 'found' && backup">
          <div class="backup-found">
            <span class="settings-card__icon"><CloudDownload :size="24" /></span>
            <span>
              <strong>{{ $t('backup.foundTitle') }}</strong>
              <small>{{ formatDate(backup.modifiedAt) }}</small>
            </span>
          </div>
          <p v-if="replacesData" class="backup-warning">
            <TriangleAlert :size="18" /> {{ $t('backup.replaceWarning') }}
          </p>
        </template>

        <p v-else-if="state === 'none'" class="muted">{{ $t('backup.noneFound') }}</p>
        <p v-else-if="state === 'error'" class="form-error" role="alert">{{ errorText }}</p>

        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button
            v-if="state === 'found'"
            type="button"
            class="button button--primary"
            @click="restore"
          >
            {{ $t('backup.restore') }}
          </button>
          <button
            v-else-if="state === 'error' || state === 'none'"
            type="button"
            class="button button--primary"
            @click="search"
          >
            {{ $t('common.retry') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
