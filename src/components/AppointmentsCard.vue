<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarClock, CalendarPlus, Link2, Pencil } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import type { CalendarLink } from '@/domain/model'
import { useEditorsStore } from '@/stores/editors'
import { useKindyStore } from '@/stores/kindy'

import type { AgendaDraft } from '@/domain/agendaDraft'

import AddAgendaItemDialog from './AddAgendaItemDialog.vue'
import CalendarSuggestions from './CalendarSuggestions.vue'

const props = defineProps<{ personId: string }>()
const store = useKindyStore()
const editors = useEditorsStore()
const { t, locale } = useI18n()
const showPlan = ref(false)
const planError = ref<string>()

/** Upcoming appointments first, then the most recent ones from the past week. */
const appointments = computed(() => {
  const since = Date.now() - 7 * 86_400_000
  return (store.data?.calendarLinks ?? [])
    .filter(
      (link) =>
        link.status === 'linked' &&
        link.personIds.includes(props.personId) &&
        link.startsAt >= since,
    )
    .sort((left, right) => left.startsAt - right.startsAt)
})

function when(link: CalendarLink): string {
  return new Intl.DateTimeFormat(locale.value, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(link.allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(link.startsAt)
}

async function plan(draft: AgendaDraft): Promise<void> {
  if (draft.kind !== 'appointment') return
  planError.value = undefined
  try {
    await store.createAppointment(draft)
    showPlan.value = false
  } catch {
    planError.value = t('agendaAdd.appointment.failed')
  }
}
</script>

<template>
  <article class="card profile-card appointments-card">
    <div class="card-heading-row card-heading-row--wrap">
      <h2><CalendarClock :size="18" /> {{ $t('calendar.appointments') }}</h2>
    </div>
    <div class="appointments-card__actions">
      <button class="button button--ghost" @click="showPlan = true">
        <CalendarPlus :size="16" /> {{ $t('calendar.plan') }}
      </button>
      <button class="button button--ghost" @click="editors.linkAppointment(personId)">
        <Link2 :size="16" /> {{ $t('editors.linkAction') }}
      </button>
    </div>
    <p v-if="!appointments.length" class="muted">{{ $t('calendar.noAppointments') }}</p>
    <button
      v-for="link in appointments"
      :key="link.id"
      class="appointment-row appointment-row--button"
      @click="editors.editAppointment(link.id)"
    >
      <span class="appointment-row__copy">
        <strong>{{ link.title }}</strong>
        <small>{{ [when(link), link.location].filter(Boolean).join(' · ') }}</small>
      </span>
      <Pencil :size="16" aria-hidden="true" />
    </button>
    <CalendarSuggestions :person-id="personId" />
    <AddAgendaItemDialog
      :open="showPlan"
      :candidates="store.people"
      :synced-person-ids="[]"
      initial-kind="appointment"
      :initial-person-ids="[personId]"
      :error="planError"
      @close="showPlan = false"
      @save="plan"
    />
  </article>
</template>
