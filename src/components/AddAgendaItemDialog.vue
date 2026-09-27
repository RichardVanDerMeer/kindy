<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowLeft,
  Cake,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  CloudUpload,
  Flower2,
  Heart,
  HeartCrack,
  NotebookPen,
} from '@lucide/vue'

import type { AgendaDraft, AgendaDraftKind } from '@/domain/agendaDraft'
import type { PartialDate, Person } from '@/domain/model'

import PartialDateInput from './PartialDateInput.vue'
import PersonPicker from './PersonPicker.vue'

const props = defineProps<{
  open: boolean
  candidates: Person[]
  /** People whose dates are also written to Google Contacts. */
  syncedPersonIds: string[]
  /** Skip the choice screen, e.g. "plan appointment" from a profile. */
  initialKind?: AgendaDraftKind
  initialPersonIds?: string[]
  /** Which kinds to offer; a timeline also offers divorce, Upcoming does not. */
  kinds?: AgendaDraftKind[]
  error?: string
}>()
const emit = defineEmits<{ close: []; save: [draft: AgendaDraft] }>()

type Kind = AgendaDraftKind
const kind = ref<Kind>()
const personIds = ref<string[]>([])
const text = ref('')
const memoDate = ref('')
const partialDate = ref<PartialDate>()
const appointmentTitle = ref('')
const appointmentTime = ref('19:00')
const allDay = ref(false)
const durationMinutes = ref(120)
const location = ref('')
const customTitle = ref('')
const durations = [30, 60, 90, 120, 180]

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function choose(next?: Kind): void {
  kind.value = next
  personIds.value = [...(props.initialPersonIds ?? [])]
  appointmentTitle.value = ''
  appointmentTime.value = '19:00'
  allDay.value = false
  durationMinutes.value = 120
  location.value = ''
  customTitle.value = ''
  text.value = ''
  memoDate.value = todayIso()
  partialDate.value = undefined
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) choose(props.initialKind)
  },
)

const allOptions = [
  { kind: 'appointment', icon: CalendarClock },
  { kind: 'memo', icon: NotebookPen },
  { kind: 'birthday', icon: Cake },
  { kind: 'wedding', icon: Heart },
  { kind: 'divorce', icon: HeartCrack },
  { kind: 'death', icon: Flower2 },
  { kind: 'custom', icon: CalendarPlus },
] as const
const options = computed(() =>
  allOptions.filter((option) =>
    (props.kinds ?? ['appointment', 'memo', 'birthday', 'wedding', 'death', 'custom']).includes(
      option.kind,
    ),
  ),
)

/** Birthdays, wedding days and deaths are also written to linked Google contacts. */
const writesToGoogle = computed(
  () =>
    (kind.value === 'birthday' || kind.value === 'wedding' || kind.value === 'death') &&
    personIds.value.some((personId) => props.syncedPersonIds.includes(personId)),
)
const maxPeople = computed(() => {
  if (kind.value === 'wedding' || kind.value === 'divorce') return 2
  if (kind.value === 'appointment' || kind.value === 'custom') return undefined
  return 1
})

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
    case 'divorce':
      return personIds.value.length >= 1 && Boolean(partialDate.value)
    case 'custom':
      return (
        personIds.value.length >= 1 &&
        Boolean(customTitle.value.trim()) &&
        Boolean(partialDate.value)
      )
    case 'appointment':
      return (
        personIds.value.length >= 1 &&
        Boolean(appointmentTitle.value.trim()) &&
        Boolean(memoDate.value) &&
        (allDay.value || Boolean(appointmentTime.value))
      )
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
  } else if (kind.value === 'divorce' && partialDate.value) {
    emit('save', { kind: 'divorce', personIds: [...personIds.value], date: partialDate.value })
  } else if (kind.value === 'custom' && partialDate.value) {
    emit('save', {
      kind: 'custom',
      personIds: [...personIds.value],
      title: customTitle.value,
      date: partialDate.value,
    })
  } else if (kind.value === 'death' && partialDate.value) {
    emit('save', { kind: 'death', personId, date: partialDate.value })
  } else if (kind.value === 'appointment') {
    // Whole-day appointments are stored from midnight to midnight, UTC, as calendars expect.
    const startsAt = allDay.value
      ? Date.parse(`${memoDate.value}T00:00:00Z`)
      : new Date(`${memoDate.value}T${appointmentTime.value}:00`).getTime()
    const endsAt = allDay.value ? startsAt + 86_400_000 : startsAt + durationMinutes.value * 60_000
    emit('save', {
      kind: 'appointment',
      personIds: [...personIds.value],
      title: appointmentTitle.value,
      startsAt,
      endsAt,
      allDay: allDay.value,
      location: location.value,
    })
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

          <template v-else-if="kind === 'appointment'">
            <label class="field">
              <span>{{ $t('agendaAdd.appointment.name') }}</span>
              <input v-model="appointmentTitle" required autocomplete="off" />
            </label>
            <div class="field-row">
              <label class="field">
                <span>{{ $t('agendaAdd.date') }}</span>
                <input v-model="memoDate" type="date" required />
              </label>
              <label v-if="!allDay" class="field">
                <span>{{ $t('agendaAdd.appointment.time') }}</span>
                <input v-model="appointmentTime" type="time" required />
              </label>
            </div>
            <div class="field-row field-row--center">
              <label class="check-field">
                <input v-model="allDay" type="checkbox" />
                <span>{{ $t('agendaAdd.appointment.allDay') }}</span>
              </label>
              <label v-if="!allDay" class="field field--compact">
                <span class="sr-only">{{ $t('agendaAdd.appointment.duration') }}</span>
                <select v-model.number="durationMinutes">
                  <option v-for="minutes in durations" :key="minutes" :value="minutes">
                    {{
                      minutes < 60
                        ? $t('agendaAdd.appointment.minutes', { count: minutes })
                        : $t('agendaAdd.appointment.hours', { count: minutes / 60 })
                    }}
                  </option>
                </select>
              </label>
            </div>
            <label class="field">
              <span>{{ $t('agendaAdd.appointment.location') }}</span>
              <input v-model="location" autocomplete="off" />
            </label>
          </template>

          <template v-else>
            <label v-if="kind === 'custom'" class="field">
              <span>{{ $t('agendaAdd.custom.name') }}</span>
              <input v-model="customTitle" required autocomplete="off" />
            </label>
            <fieldset class="field picker-field">
              <legend>
                {{
                  kind === 'birthday' || kind === 'death'
                    ? $t(`agendaAdd.${kind}.date`)
                    : $t('agendaAdd.date')
                }}
              </legend>
              <PartialDateInput v-model="partialDate" />
            </fieldset>
          </template>

          <p class="dialog-question">
            {{
              kind === 'wedding' || kind === 'divorce' || kind === 'appointment'
                ? $t(`agendaAdd.${kind}.people`)
                : kind === 'custom'
                  ? $t('agendaAdd.appointment.people')
                  : $t('agendaAdd.person')
            }}
          </p>
          <PersonPicker v-model="personIds" :candidates="pickable" :max="maxPeople" />

          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
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
