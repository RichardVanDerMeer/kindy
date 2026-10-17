<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, CalendarClock, Check, Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { fromDateCalendar, sameOccurrence, type DeviceCalendarEvent } from '@/domain/calendar'
import { normalizeText } from '@/domain/duplicates'
import { useKindyStore } from '@/stores/kindy'
import { useToastStore } from '@/stores/toast'

import PersonPicker from './PersonPicker.vue'

/**
 * Any appointment from the phone's calendar, linked to people chosen by hand:
 * for appointments Kindy cannot match on a name or a guest.
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useKindyStore()
const toast = useToastStore()
const { t, locale } = useI18n()

const query = ref('')
const chosen = ref<DeviceCalendarEvent | null>(null)
const personIds = ref<string[]>([])
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    query.value = ''
    chosen.value = null
    void store.refreshCalendar()
  },
)

const startOfToday = computed(() => new Date().setHours(0, 0, 0, 0))

/** Calendar appointments, newest first among the coming ones, then the past week. */
const events = computed(() => {
  const normalized = normalizeText(query.value)
  return store.calendarEvents
    .filter((event) => !fromDateCalendar(event))
    .filter(
      (event) =>
        !normalized || normalizeText(`${event.title} ${event.location ?? ''}`).includes(normalized),
    )
    .sort((left, right) => left.startsAt - right.startsAt)
})
const coming = computed(() => events.value.filter((event) => event.startsAt >= startOfToday.value))
const earlier = computed(() =>
  events.value.filter((event) => event.startsAt < startOfToday.value).reverse(),
)

function existingLink(event: DeviceCalendarEvent) {
  return store.data?.calendarLinks.find(
    (link) => link.status === 'linked' && sameOccurrence(link, event),
  )
}

function linkedNames(event: DeviceCalendarEvent): string {
  return (existingLink(event)?.personIds ?? [])
    .map((id) => store.personById(id))
    .map((person) => person?.givenName ?? person?.displayName)
    .filter(Boolean)
    .join(', ')
}

function when(event: DeviceCalendarEvent): string {
  return new Intl.DateTimeFormat(locale.value, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(event.allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(event.startsAt)
}

/** Opens the people step, starting from who is linked or suggested already. */
function choose(event: DeviceCalendarEvent): void {
  chosen.value = event
  const suggested = store.calendarSuggestions.find(
    (suggestion) =>
      suggestion.event.id === event.id && suggestion.event.startsAt === event.startsAt,
  )
  personIds.value = [...(existingLink(event)?.personIds ?? suggested?.personIds ?? [])]
}

async function save(): Promise<void> {
  if (!chosen.value || !personIds.value.length) return
  saving.value = true
  try {
    await store.linkCalendarEvent(chosen.value, personIds.value)
    toast.show(t('calendar.linkedTo', { title: chosen.value.title }))
    emit('close')
  } catch {
    toast.show(t('common.failed'), 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <div class="dialog dialog--scroll" role="dialog" aria-modal="true">
        <div class="dialog__handle" aria-hidden="true"></div>

        <template v-if="chosen">
          <div class="inline-form-heading inline-form-heading--back">
            <button
              type="button"
              class="icon-button"
              :aria-label="t('common.back')"
              @click="chosen = null"
            >
              <ArrowLeft :size="20" />
            </button>
            <h2>{{ t('calendar.whoTitle') }}</h2>
          </div>
          <p class="dialog-question">{{ chosen.title }} · {{ when(chosen) }}</p>
          <PersonPicker v-model="personIds" :candidates="store.people" />
          <div class="dialog__actions">
            <button type="button" class="button button--ghost" @click="chosen = null">
              {{ t('common.back') }}
            </button>
            <button
              type="button"
              class="button button--primary"
              :disabled="!personIds.length || saving"
              :aria-busy="saving || undefined"
              @click="save"
            >
              {{ t('calendar.linkCount', { count: personIds.length }, personIds.length) }}
            </button>
          </div>
        </template>

        <template v-else>
          <h2>{{ t('calendar.pickTitle') }}</h2>
          <template v-if="store.calendarPermission !== 'granted'">
            <p class="muted">{{ t('calendar.connectHint') }}</p>
            <button
              class="button button--primary settings-wide-button"
              @click="store.connectCalendar()"
            >
              {{ t('calendar.connect') }}
            </button>
          </template>
          <template v-else>
            <label class="search-field search-field--compact">
              <Search :size="18" aria-hidden="true" />
              <span class="sr-only">{{ t('editors.searchAppointments') }}</span>
              <input v-model="query" type="search" :placeholder="t('editors.searchAppointments')" />
            </label>
            <div class="choice-list choice-list--people">
              <template v-for="group in [coming, earlier]" :key="group === coming ? 'c' : 'e'">
                <span
                  v-if="group === earlier && earlier.length"
                  class="generation-label calendar-pick__earlier"
                >
                  {{ t('calendar.earlier') }}
                </span>
                <button
                  v-for="event in group"
                  :key="`${event.id}-${event.startsAt}`"
                  type="button"
                  class="choice-row"
                  @click="choose(event)"
                >
                  <span class="choice-row__icon surface--primary">
                    <CalendarClock :size="18" />
                  </span>
                  <span class="choice-row__copy">
                    <strong>{{ event.title || t('calendar.untitled') }}</strong>
                    <small>{{ [when(event), event.location].filter(Boolean).join(' · ') }}</small>
                  </span>
                  <span v-if="existingLink(event)" class="status-pill">
                    <Check :size="12" /> {{ linkedNames(event) }}
                  </span>
                </button>
              </template>
              <p v-if="!events.length" class="muted">{{ t('editors.noAppointments') }}</p>
            </div>
          </template>
          <div class="dialog__actions">
            <button type="button" class="button button--ghost" @click="emit('close')">
              {{ t('common.close') }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
