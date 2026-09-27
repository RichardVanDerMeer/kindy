<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Trash2 } from '@lucide/vue'

import { useKindyStore } from '@/stores/kindy'

import PersonPicker from './PersonPicker.vue'

const props = defineProps<{ occurrenceId?: string }>()
const emit = defineEmits<{ close: [] }>()
const store = useKindyStore()

const text = ref('')
const date = ref('')
const personIds = ref<string[]>([])
const confirmDelete = ref(false)

function isoDay(value: number): string {
  const day = new Date(value)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

watch(
  () => props.occurrenceId,
  (id) => {
    const occurrence = store.data?.reminderOccurrences.find((item) => item.id === id)
    const reminder = store.data?.reminders.find((item) => item.id === occurrence?.reminderId)
    if (!occurrence || !reminder) return
    text.value = reminder.title
    date.value = isoDay(occurrence.snoozedUntil ?? occurrence.dueAt)
    personIds.value = reminder.personId ? [reminder.personId] : []
    confirmDelete.value = false
  },
  { immediate: true },
)

const valid = computed(() => Boolean(text.value.trim() && date.value && personIds.value[0]))

async function save(): Promise<void> {
  const [personId] = personIds.value
  if (!props.occurrenceId || !valid.value || !personId) return
  await store.updateMemo(props.occurrenceId, { text: text.value, date: date.value, personId })
  emit('close')
}

async function remove(): Promise<void> {
  if (!props.occurrenceId) return
  if (!confirmDelete.value) {
    confirmDelete.value = true
    return
  }
  await store.deleteMemo(props.occurrenceId)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="occurrenceId" class="dialog-backdrop" @click.self="emit('close')">
      <form class="dialog dialog--scroll" role="dialog" aria-modal="true" @submit.prevent="save">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ $t('editors.memoTitle') }}</h2>
        <label class="field">
          <span>{{ $t('agendaAdd.memo.text') }}</span>
          <textarea v-model="text" rows="3" required />
        </label>
        <label class="field">
          <span>{{ $t('agendaAdd.date') }}</span>
          <input v-model="date" type="date" required />
        </label>
        <p class="dialog-question">{{ $t('agendaAdd.person') }}</p>
        <PersonPicker v-model="personIds" :candidates="store.people" :max="1" />
        <div class="dialog__actions">
          <button
            type="button"
            class="button button--ghost button--danger"
            :class="{ 'button--confirm': confirmDelete }"
            @click="remove"
          >
            <Trash2 :size="17" />
            {{ confirmDelete ? $t('timeline.confirmRemove') : $t('wishes.delete') }}
          </button>
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="submit" class="button button--primary" :disabled="!valid">
            {{ $t('edit.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
