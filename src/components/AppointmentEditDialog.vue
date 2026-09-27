<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarClock, Info, Unlink } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { useKindyStore } from '@/stores/kindy'

import PersonPicker from './PersonPicker.vue'

const props = defineProps<{ linkId?: string }>()
const emit = defineEmits<{ close: [] }>()
const store = useKindyStore()
const { t, locale } = useI18n()

const title = ref('')
const date = ref('')
const time = ref('19:00')
const allDay = ref(false)
const durationMinutes = ref(60)
const location = ref('')
const personIds = ref<string[]>([])
const error = ref<string>()
const durations = [30, 60, 90, 120, 180, 240]

const link = computed(() => store.data?.calendarLinks.find((item) => item.id === props.linkId))
/** Kindy only changes appointments it put in the calendar itself. */
const editableDetails = computed(() => link.value?.createdBy === 'kindy')

const pad = (value: number) => String(value).padStart(2, '0')

watch(
  () => props.linkId,
  () => {
    const current = link.value
    if (!current) return
    const start = new Date(current.startsAt)
    title.value = current.title
    allDay.value = current.allDay
    date.value = current.allDay
      ? new Date(current.startsAt).toISOString().slice(0, 10)
      : `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
    time.value = `${pad(start.getHours())}:${pad(start.getMinutes())}`
    const minutes = current.endsAt ? Math.round((current.endsAt - current.startsAt) / 60_000) : 60
    durationMinutes.value = durations.includes(minutes) ? minutes : 60
    location.value = current.location ?? ''
    personIds.value = [...current.personIds]
    error.value = undefined
  },
  { immediate: true },
)

const summary = computed(() => {
  const current = link.value
  if (!current) return ''
  return [
    new Intl.DateTimeFormat(locale.value, {
      dateStyle: 'full',
      ...(current.allDay ? {} : { timeStyle: 'short' }),
    }).format(current.startsAt),
    current.location,
  ]
    .filter(Boolean)
    .join(' · ')
})

const valid = computed(
  () =>
    personIds.value.length > 0 &&
    (!editableDetails.value || (Boolean(title.value.trim()) && Boolean(date.value))),
)

async function save(): Promise<void> {
  const current = link.value
  if (!current || !props.linkId || !valid.value) return
  const startsAt = !editableDetails.value
    ? current.startsAt
    : allDay.value
      ? Date.parse(`${date.value}T00:00:00Z`)
      : new Date(`${date.value}T${time.value}:00`).getTime()
  const endsAt = !editableDetails.value
    ? (current.endsAt ?? current.startsAt)
    : allDay.value
      ? startsAt + 86_400_000
      : startsAt + durationMinutes.value * 60_000
  try {
    await store.updateAppointment(props.linkId, {
      title: editableDetails.value ? title.value : current.title,
      startsAt,
      endsAt,
      allDay: editableDetails.value ? allDay.value : current.allDay,
      location: editableDetails.value ? location.value : current.location,
      personIds: [...personIds.value],
    })
    emit('close')
  } catch {
    error.value = t('editors.appointmentFailed')
  }
}

async function unlink(): Promise<void> {
  if (!props.linkId) return
  await store.unlinkCalendarEvent(props.linkId)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="link" class="dialog-backdrop" @click.self="emit('close')">
      <form class="dialog dialog--scroll" role="dialog" aria-modal="true" @submit.prevent="save">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ $t('editors.appointmentTitle') }}</h2>

        <template v-if="editableDetails">
          <label class="field">
            <span>{{ $t('agendaAdd.appointment.name') }}</span>
            <input v-model="title" required autocomplete="off" />
          </label>
          <div class="field-row">
            <label class="field">
              <span>{{ $t('agendaAdd.date') }}</span>
              <input v-model="date" type="date" required />
            </label>
            <label v-if="!allDay" class="field">
              <span>{{ $t('agendaAdd.appointment.time') }}</span>
              <input v-model="time" type="time" required />
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
          <p class="sync-hint"><CalendarClock :size="16" /> {{ $t('editors.alsoInCalendar') }}</p>
        </template>
        <template v-else>
          <div class="appointment-summary">
            <strong>{{ link.title }}</strong>
            <small>{{ summary }}</small>
          </div>
          <p class="edit-sync-hint"><Info :size="15" /> {{ $t('editors.fromCalendar') }}</p>
        </template>

        <p class="dialog-question">{{ $t('agendaAdd.appointment.people') }}</p>
        <PersonPicker v-model="personIds" :candidates="store.people" />

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="dialog__actions">
          <button type="button" class="button button--ghost button--danger" @click="unlink">
            <Unlink :size="17" /> {{ $t('calendar.unlink') }}
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
