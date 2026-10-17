<script setup lang="ts">
import { ref, watch } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { useKindyStore } from '@/stores/kindy'

/**
 * Confirms disconnecting Google or wiping the account's Kindy data
 * (ADR 0005). Wiping never touches Google Contacts.
 */
const props = defineProps<{ open: boolean; mode: 'disconnect' | 'wipe' }>()
const emit = defineEmits<{ close: []; done: [] }>()

const store = useKindyStore()
const { t } = useI18n()
const fromDrive = ref(false)
const busy = ref(false)
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    fromDrive.value = false
    busy.value = false
    error.value = ''
  },
)

async function confirm(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    if (props.mode === 'wipe') await store.wipeAccount({ fromDrive: fromDrive.value })
    else await store.disconnectGoogle()
    emit('done')
  } catch {
    error.value = t('account.failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="!busy && emit('close')">
      <section class="dialog" role="alertdialog" aria-modal="true">
        <div class="dialog__handle" aria-hidden="true"></div>
        <template v-if="mode === 'disconnect'">
          <h2>{{ t('account.disconnectTitle', { email: store.account?.email }) }}</h2>
          <p class="muted">{{ t('account.disconnectHint') }}</p>
          <p v-if="store.pendingSyncCount" class="muted">
            {{
              t(
                'account.disconnectPending',
                { count: store.pendingSyncCount },
                store.pendingSyncCount,
              )
            }}
          </p>
        </template>
        <template v-else>
          <h2>
            <TriangleAlert :size="20" aria-hidden="true" />
            {{ t('account.wipeTitle', { email: store.account?.email }) }}
          </h2>
          <p class="muted">{{ t('account.wipeText') }}</p>
          <label class="check-field">
            <input v-model="fromDrive" type="checkbox" />
            <span>{{ t('account.wipeDrive') }}</span>
          </label>
          <small v-if="!fromDrive" class="field-hint">{{ t('account.wipeDriveHint') }}</small>
        </template>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="dialog__actions">
          <button
            type="button"
            class="button button--ghost"
            :disabled="busy"
            @click="emit('close')"
          >
            {{ t('people.cancel') }}
          </button>
          <button
            type="button"
            class="button"
            :class="mode === 'wipe' ? 'button--danger' : 'button--primary'"
            :disabled="busy"
            @click="confirm"
          >
            {{ mode === 'wipe' ? t('account.wipeConfirm') : t('account.disconnectConfirm') }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
