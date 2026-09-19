<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  close: []
  google: []
  save: [input: { displayName: string; howWeMet?: string }]
}>()

const displayName = ref('')
const howWeMet = ref('')
const nameInput = ref<HTMLInputElement>()

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    displayName.value = ''
    howWeMet.value = ''
    await nextTick()
    nameInput.value?.focus()
  },
)

function submit(): void {
  if (!displayName.value.trim()) return
  emit('save', { displayName: displayName.value, howWeMet: howWeMet.value })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="$emit('close')">
      <form class="dialog" role="dialog" aria-modal="true" @submit.prevent="submit">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ $t('people.add') }}</h2>
        <button type="button" class="google-import-option" @click="$emit('google')">
          <span class="google-mark">G</span>
          <span>
            <strong>{{ $t('google.importFromGoogle') }}</strong>
            <small>{{ $t('google.importHint') }}</small>
          </span>
        </button>
        <div class="dialog-divider">
          <span>{{ $t('google.orManual') }}</span>
        </div>
        <label class="field">
          <span>{{ $t('people.name') }}</span>
          <input ref="nameInput" v-model="displayName" required autocomplete="name" />
        </label>
        <label class="field">
          <span>{{ $t('people.howWeMet') }}</span>
          <input v-model="howWeMet" />
        </label>
        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="$emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="submit" class="button button--primary" :disabled="!displayName.trim()">
            {{ $t('people.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
