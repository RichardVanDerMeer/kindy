<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarClock, CalendarPlus, Check, Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { sameOccurrence, type DeviceCalendarEvent } from '@/domain/calendar'
import { normalizeText } from '@/domain/duplicates'
import { useKindyStore } from '@/stores/kindy'

/** Pick an appointment from the phone's calendar and link it to this person. */
const props = defineProps<{ personId?: string }>()
const emit = defineEmits<{ close: [] }>()
const store = useKindyStore()
const { locale } = useI18n()
const query = ref('')

watch(
  () => props.personId,
  (id) => {
    query.value = ''
    if (id) void store.refreshCalendar()
  },
)

const person = computed(() => (props.personId ? store.personById(props.personId) : undefined))

const upcoming = computed(() => {
  const now = Date.now()
  const normalized = normalizeText(query.value)
  return store.calendarEvents
    .filter((event) => (event.endsAt ?? event.startsAt) >= now)
    .filter(
      (event) =>
        !normalized || normalizeText(`${event.title} ${event.location ?? ''}`).includes(normalized),
    )
    .sort((left, right) => left.startsAt - right.startsAt)
})

function isLinked(event: DeviceCalendarEvent): boolean {
  return Boolean(
    props.personId &&
    store.data?.calendarLinks.some(
      (link) =>
        link.status === 'linked' &&
        sameOccurrence(link, event) &&
        link.personIds.includes(props.personId as string),
    ),
  )
}

function when(event: DeviceCalendarEvent): string {
  return new Intl.DateTimeFormat(locale.value, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(event.allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(event.startsAt)
}

async function link(event: DeviceCalendarEvent): Promise<void> {
  if (!props.personId || isLinked(event)) return
  await store.linkEventToPerson(event, props.personId)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="personId" class="dialog-backdrop" @click.self="emit('close')">
      <div class="dialog dialog--scroll" role="dialog" aria-modal="true">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>
          {{ $t('editors.linkTitle', { name: person?.givenName ?? person?.displayName ?? '' }) }}
        </h2>

        <template v-if="store.calendarPermission !== 'granted'">
          <p class="muted">{{ $t('calendar.connectHint') }}</p>
          <button
            class="button button--primary settings-wide-button"
            @click="store.connectCalendar()"
          >
            <CalendarPlus :size="18" /> {{ $t('calendar.connect') }}
          </button>
        </template>
        <template v-else>
          <label class="search-field search-field--compact">
            <Search :size="18" aria-hidden="true" />
            <span class="sr-only">{{ $t('editors.searchAppointments') }}</span>
            <input v-model="query" type="search" :placeholder="$t('editors.searchAppointments')" />
          </label>
          <div class="choice-list choice-list--people">
            <button
              v-for="event in upcoming"
              :key="`${event.id}-${event.startsAt}`"
              type="button"
              class="choice-row"
              :disabled="isLinked(event)"
              @click="link(event)"
            >
              <span class="choice-row__icon surface--primary"><CalendarClock :size="18" /></span>
              <span class="choice-row__copy">
                <strong>{{ event.title }}</strong>
                <small>{{ [when(event), event.location].filter(Boolean).join(' · ') }}</small>
              </span>
              <span v-if="isLinked(event)" class="status-pill">
                <Check :size="12" /> {{ $t('editors.linked') }}
              </span>
            </button>
            <p v-if="!upcoming.length" class="muted">{{ $t('editors.noAppointments') }}</p>
          </div>
        </template>

        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('common.close') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
