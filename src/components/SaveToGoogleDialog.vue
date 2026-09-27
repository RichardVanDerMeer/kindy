<script setup lang="ts">
import { CloudOff, CloudUpload } from '@lucide/vue'

/** Explains what "save in Google Contacts" does before a new Google contact is made. */
defineProps<{ open: boolean; name: string }>()
const emit = defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ $t('saveToGoogle.title', { name }) }}</h2>
        <p class="muted">{{ $t('saveToGoogle.intro') }}</p>
        <div class="save-to-google">
          <div>
            <strong><CloudUpload :size="16" /> {{ $t('saveToGoogle.goes') }}</strong>
            <p>{{ $t('saveToGoogle.goesList') }}</p>
          </div>
          <div>
            <strong><CloudOff :size="16" /> {{ $t('saveToGoogle.stays') }}</strong>
            <p>{{ $t('saveToGoogle.staysList') }}</p>
          </div>
        </div>
        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="button" class="button button--primary" @click="emit('confirm')">
            {{ $t('saveToGoogle.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
