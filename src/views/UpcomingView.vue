<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarPlus, ChevronDown, ChevronUp, Plus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import AddAgendaItemDialog, { type AgendaDraft } from '@/components/AddAgendaItemDialog.vue'
import AgendaCard from '@/components/AgendaCard.vue'
import CalendarSuggestions from '@/components/CalendarSuggestions.vue'
import ViewHeader from '@/components/ViewHeader.vue'
import {
  agendaFilters,
  matchesAgendaFilters,
  toggleAgendaFilter,
  type AgendaFilter,
  type AgendaItem,
} from '@/domain/agenda'
import { useKindyStore } from '@/stores/kindy'

const store = useKindyStore()
const { t, locale } = useI18n()

/** Empty means "all". */
const selected = ref<Set<AgendaFilter>>(new Set())
const showEarlier = ref(false)
const showAdd = ref(false)
const syncedPersonIds = computed(() =>
  store.googleWriteBack
    ? (store.data?.externalIdentities ?? []).map((identity) => identity.personId)
    : [],
)

const addError = ref<string>()

async function save(draft: AgendaDraft): Promise<void> {
  addError.value = undefined
  if (draft.kind === 'appointment') {
    try {
      await store.createAppointment(draft)
    } catch {
      addError.value = t('agendaAdd.appointment.failed')
      return
    }
  } else if (draft.kind === 'memo') await store.addMemo(draft)
  else if (draft.kind === 'birthday') await store.setBirthDate(draft.personId, draft.date)
  else if (draft.kind === 'death') await store.markDeceased(draft.personId, draft.date)
  else await store.addWeddingAnniversary(draft.personIds, draft.date)
  showAdd.value = false
}

function toggle(filter: AgendaFilter): void {
  selected.value = toggleAgendaFilter(selected.value, filter)
}

const visible = computed(() =>
  store.agenda.filter((item) => matchesAgendaFilters(item, selected.value)),
)
const earlier = computed(() => visible.value.filter((item) => item.daysFromToday < 0))

/** Groups: today, the rest of this week, then one group per month. */
const groups = computed(() => {
  const result: Array<{ key: string; label: string; items: AgendaItem[] }> = []
  function push(key: string, label: string, item: AgendaItem): void {
    const last = result.at(-1)
    if (last?.key === key) last.items.push(item)
    else result.push({ key, label, items: [item] })
  }
  for (const item of visible.value) {
    if (item.daysFromToday < 0) continue
    if (item.daysFromToday === 0) push('today', t('upcoming.today'), item)
    else if (item.daysFromToday <= 7) push('week', t('upcoming.thisWeek'), item)
    else {
      const date = new Date(`${item.date}T12:00:00`)
      const label = new Intl.DateTimeFormat(locale.value, {
        month: 'long',
        year: 'numeric',
      }).format(date)
      push(item.date.slice(0, 7), label, item)
    }
  }
  return result
})
</script>

<template>
  <section class="view upcoming-view">
    <ViewHeader />
    <h1>{{ $t('upcoming.title') }}</h1>

    <button
      v-if="store.calendarPermission !== 'granted'"
      class="calendar-connect card"
      @click="store.connectCalendar()"
    >
      <CalendarPlus :size="20" />
      <span>
        <strong>{{ $t('calendar.connect') }}</strong>
        <small>{{ $t('calendar.connectHint') }}</small>
      </span>
    </button>
    <CalendarSuggestions :limit="2" />

    <div class="filter-row" role="group" :aria-label="$t('upcoming.title')">
      <button
        class="chip chip--toggle"
        :class="{ 'chip--active': selected.size === 0 }"
        :aria-pressed="selected.size === 0"
        @click="selected = new Set()"
      >
        {{ $t('upcoming.filters.all') }}
      </button>
      <span class="filter-divider" aria-hidden="true" />
      <button
        v-for="filter in agendaFilters"
        :key="filter"
        class="chip chip--toggle"
        :class="{ 'chip--active': selected.has(filter) }"
        :aria-pressed="selected.has(filter)"
        @click="toggle(filter)"
      >
        {{ $t(`upcoming.filters.${filter}`) }}
      </button>
    </div>

    <button
      v-if="earlier.length"
      class="earlier-toggle"
      :aria-expanded="showEarlier"
      @click="showEarlier = !showEarlier"
    >
      <component :is="showEarlier ? ChevronUp : ChevronDown" :size="16" />
      {{ showEarlier ? $t('upcoming.hideEarlier') : $t('upcoming.earlierThisWeek') }}
      <span class="earlier-toggle__count">{{ earlier.length }}</span>
    </button>
    <section v-if="showEarlier && earlier.length" class="agenda-group agenda-group--earlier">
      <h2 class="section-title">{{ $t('upcoming.earlierThisWeek') }}</h2>
      <div class="timeline-list">
        <AgendaCard v-for="item in earlier" :key="item.id" :item="item" />
      </div>
    </section>

    <section v-for="group in groups" :key="group.key" class="agenda-group">
      <h2 class="section-title" :class="{ 'section-title--today': group.key === 'today' }">
        {{ group.label }}
      </h2>
      <div class="timeline-list">
        <AgendaCard v-for="item in group.items" :key="item.id" :item="item" />
      </div>
    </section>

    <div v-if="!groups.length" class="empty-state card">
      <h2>{{ $t('upcoming.empty') }}</h2>
    </div>

    <button class="floating-action" :aria-label="$t('agendaAdd.title')" @click="showAdd = true">
      <Plus :size="32" />
    </button>
    <AddAgendaItemDialog
      :open="showAdd"
      :candidates="store.people"
      :synced-person-ids="syncedPersonIds"
      :error="addError"
      @close="showAdd = false"
      @save="save"
    />
  </section>
</template>
