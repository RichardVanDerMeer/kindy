<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowLeft,
  Cake,
  ChevronRight,
  CloudUpload,
  Flower2,
  Heart,
  NotebookPen,
} from '@lucide/vue'

import type { PartialDate, Person } from '@/domain/model'

import PartialDateInput from './PartialDateInput.vue'
import PersonPicker from './PersonPicker.vue'

export type AgendaDraft =
  | { kind: 'memo'; personId: string; text: string; date: string }
  | { kind: 'birthday'; personId: string; date: PartialDate }
  | { kind: 'wedding'; personIds: string[]; date: PartialDate }
  | { kind: 'death'; personId: string; date: PartialDate }

const props = defineProps<{
  open: boolean
  candidates: Person[]
  /** People whose dates are also written to Google Contacts. */
  syncedPersonIds: string[]
}>()
const emit = defineEmits<{ close: []; save: [draft: AgendaDraft] }>()

type Kind = AgendaDraft['kind']
const kind = ref<Kind>()
const personIds = ref<string[]>([])
const text = ref('')
const memoDate = ref('')
const partialDate = ref<PartialDate>()

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function choose(next?: Kind): void {
  kind.value = next
  personIds.value = []
  text.value = ''
  memoDate.value = todayIso()
  partialDate.value = undefined
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) choose(undefined)
  },
)

const options = [
  { kind: 'memo', icon: NotebookPen },
  { kind: 'birthday', icon: Cake },
  { kind: 'wedding', icon: Heart },
  { kind: 'death', icon: Flower2 },
] as const

/** Memos stay in Kindy; the dates are written to linked Google contacts. */
const writesToGoogle = computed(
  () =>
    kind.value !== 'memo' &&
    personIds.value.some((personId) => props.syncedPersonIds.includes(personId)),
)

const pickable = computed(() =>
  kind.value === 'death'
    ? props.candidates.filter((person) => !person.isDeceased && !person.isSelf)
    : props.candidates,
)

const valid = computed(() => {
  switch (kind.value) {
    case 'memo':
      return personIds.value.length === 1 && Boolean(text.value.trim()) && Boolean(memoDate.value)
    case 'birthday':
    case 'death':
      return personIds.value.length === 1 && Boolean(partialDate.value)
    case 'wedding':
      return personIds.value.length >= 1 && Boolean(partialDate.value)
    default:
      return false
  }
})

function submit(): void {
  if (!valid.value) return
  const [personId = ''] = personIds.value
  if (kind.value === 'memo') {
    emit('save', { kind: 'memo', personId, text: text.value, date: memoDate.value })
  } else if (kind.value === 'birthday' && partialDate.value) {
    emit('save', { kind: 'birthday', personId, date: partialDate.value })
  } else if (kind.value === 'wedding' && partialDate.value) {
    emit('save', { kind: 'wedding', personIds: personIds.value, date: partialDate.value })
  } else if (kind.value === 'death' && partialDate.value) {
    emit('save', { kind: 'death', personId, date: partialDate.value })
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <form class="dialog dialog--scroll" role="dialog" aria-modal="true" @submit.prevent="submit">
        <div class="dialog__handle" aria-hidden="true"></div>

        <template v-if="!kind">
          <h2>{{ $t('agendaAdd.title') }}</h2>
          <div class="choice-list">
            <button
              v-for="option in options"
              :key="option.kind"
              type="button"
              class="choice-row choice-row--large"
              @click="choose(option.kind)"
            >
              <span class="choice-row__icon surface--primary">
                <component :is="option.icon" :size="20" />
              </span>
              <span class="choice-row__copy">
                <strong>{{ $t(`agendaAdd.${option.kind}.title`) }}</strong>
                <small>{{ $t(`agendaAdd.${option.kind}.hint`) }}</small>
              </span>
              <ChevronRight :size="18" aria-hidden="true" />
            </button>
          </div>
          <div class="dialog__actions">
            <button type="button" class="button button--ghost" @click="emit('close')">
              {{ $t('people.cancel') }}
            </button>
          </div>
        </template>

        <template v-else>
          <div class="dialog-title-row">
            <button
              type="button"
              class="icon-button"
              :aria-label="$t('common.back')"
              @click="choose(undefined)"
            >
              <ArrowLeft :size="22" />
            </button>
            <h2>{{ $t(`agendaAdd.${kind}.title`) }}</h2>
          </div>

          <template v-if="kind === 'memo'">
            <label class="field">
              <span>{{ $t('agendaAdd.memo.text') }}</span>
              <textarea v-model="text" rows="3" required />
            </label>
            <label class="field">
              <span>{{ $t('agendaAdd.date') }}</span>
              <input v-model="memoDate" type="date" required />
            </label>
          </template>

          <fieldset v-else class="field picker-field">
            <legend>
              {{
                kind === 'birthday' || kind === 'death'
                  ? $t(`agendaAdd.${kind}.date`)
                  : $t('agendaAdd.date')
              }}
            </legend>
            <PartialDateInput v-model="partialDate" />
          </fieldset>

          <p class="dialog-question">
            {{ kind === 'wedding' ? $t('agendaAdd.wedding.people') : $t('agendaAdd.person') }}
          </p>
          <PersonPicker
            v-model="personIds"
            :candidates="pickable"
            :max="kind === 'wedding' ? 2 : 1"
          />

          <p v-if="writesToGoogle" class="sync-hint">
            <CloudUpload :size="16" /> {{ $t('contactSync.willSave') }}
          </p>
          <div class="dialog__actions">
            <button type="button" class="button button--ghost" @click="emit('close')">
              {{ $t('people.cancel') }}
            </button>
            <button type="submit" class="button button--primary" :disabled="!valid">
              {{ $t('agendaAdd.save') }}
            </button>
          </div>
        </template>
      </form>
    </div>
  </Teleport>
</template>
