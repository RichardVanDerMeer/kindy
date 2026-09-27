<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{ open: boolean; googleAvailable: boolean }>()
const emit = defineEmits<{
  close: []
  google: []
  save: [input: { givenName: string; familyName?: string; saveToGoogle: boolean }]
}>()

const givenName = ref('')
const familyName = ref('')
const saveToGoogle = ref(false)
const nameInput = ref<HTMLInputElement>()

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    givenName.value = ''
    familyName.value = ''
    saveToGoogle.value = props.googleAvailable
    await nextTick()
    nameInput.value?.focus()
  },
)

function submit(): void {
  if (!givenName.value.trim()) return
  emit('save', {
    givenName: givenName.value,
    familyName: familyName.value,
    saveToGoogle: saveToGoogle.value,
  })
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
        <div class="field-row">
          <label class="field">
            <span>{{ $t('people.givenName') }}</span>
            <input ref="nameInput" v-model="givenName" required autocomplete="given-name" />
          </label>
          <label class="field">
            <span>{{ $t('people.familyName') }}</span>
            <input v-model="familyName" autocomplete="family-name" />
          </label>
        </div>
        <label v-if="googleAvailable" class="check-field">
          <input v-model="saveToGoogle" type="checkbox" />
          <span>{{ $t('contactSync.alsoSave') }}</span>
        </label>
        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="$emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="submit" class="button button--primary" :disabled="!givenName.trim()">
            {{ $t('people.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
