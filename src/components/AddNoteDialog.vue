<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{ open: boolean; personName: string }>()
const emit = defineEmits<{ close: []; save: [input: { body: string; occurredAt: number }] }>()

const body = ref('')
const date = ref('')
const textarea = ref<HTMLTextAreaElement>()

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    body.value = ''
    date.value = todayIso()
    await nextTick()
    textarea.value?.focus()
  },
)

function submit(): void {
  if (!body.value.trim() || !date.value) return
  // Notes written today keep the current time; back-dated notes sit at noon.
  const occurredAt =
    date.value === todayIso() ? Date.now() : new Date(`${date.value}T12:00:00`).getTime()
  emit('save', { body: body.value, occurredAt })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <form class="dialog" role="dialog" aria-modal="true" @submit.prevent="submit">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ $t('notes.addFor', { name: personName }) }}</h2>
        <label class="field">
          <span>{{ $t('notes.body') }}</span>
          <textarea ref="textarea" v-model="body" rows="4" required />
        </label>
        <label class="field">
          <span>{{ $t('notes.date') }}</span>
          <input v-model="date" type="date" required />
        </label>
        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="submit" class="button button--primary" :disabled="!body.trim()">
            {{ $t('notes.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
