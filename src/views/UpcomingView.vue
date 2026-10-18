<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarPlus, ChevronDown, ChevronUp, Link2, Plus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import AddAgendaItemDialog from '@/components/AddAgendaItemDialog.vue'
import type { AgendaDraft } from '@/domain/agendaDraft'
import AgendaCard from '@/components/AgendaCard.vue'
import CalendarSuggestions from '@/components/CalendarSuggestions.vue'
import LinkCalendarEventDialog from '@/components/LinkCalendarEventDialog.vue'
import ViewHeader from '@/components/ViewHeader.vue'
import {
  agendaFilters,
  matchesAgendaFilters,
  matchesAudience,
  toggleAgendaFilter,
  type AgendaFilter,
  type AgendaItem,
} from '@/domain/agenda'
import { useKindyStore } from '@/stores/kindy'
import { usePreferencesStore } from '@/stores/preferences'

const store = useKindyStore()
const preferences = usePreferencesStore()
const { t, locale } = useI18n()

/** Empty means "all". */
const selected = ref<Set<AgendaFilter>>(new Set())
const showEarlier = ref(false)
const showAdd = ref(false)
const showLinkEvent = ref(false)

const addError = ref<string>()

async function save(draft: AgendaDraft): Promise<void> {
  addError.value = undefined
  try {
    await store.addFromDraft(draft)
    showAdd.value = false
  } catch {
    addError.value = t('agendaAdd.appointment.failed')
  }
}

function toggle(filter: AgendaFilter): void {
  selected.value = toggleAgendaFilter(selected.value, filter)
}

/** Six weeks first; "Show more" adds two months at a time, so a full year never renders at once. */
const FIRST_DAYS = 42
const MORE_DAYS = 61
const horizon = ref(FIRST_DAYS)

const visible = computed(() =>
  store.agenda
    .filter((item) => matchesAgendaFilters(item, selected.value))
    .filter((item) => matchesAudience(item, preferences.agendaAudience, store.closePeopleIds)),
)
const later = computed(() => visible.value.filter((item) => item.daysFromToday > horizon.value))
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
    if (item.daysFromToday < 0 || item.daysFromToday > horizon.value) continue
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

    <div
      v-if="store.calendarPermission !== 'granted' && !store.calendarPromptDismissed"
      class="calendar-connect card"
    >
      <button class="calendar-connect__main" @click="store.connectCalendar()">
        <CalendarPlus :size="20" />
        <span>
          <strong>{{ $t('calendar.connect') }}</strong>
          <small>{{ $t('calendar.connectHint') }}</small>
        </span>
      </button>
      <button class="calendar-connect__later" @click="store.dismissCalendarPrompt()">
        {{ $t('calendar.notNow') }}
      </button>
    </div>
    <CalendarSuggestions :limit="2" />
    <!-- Appointments Kindy cannot match on a name can still be linked by hand. -->
    <button
      v-if="store.calendarPermission === 'granted'"
      class="inline-action link-other-event"
      @click="showLinkEvent = true"
    >
      <Link2 :size="16" /> {{ $t('calendar.linkOther') }}
    </button>
    <LinkCalendarEventDialog :open="showLinkEvent" @close="showLinkEvent = false" />

    <div
      class="segmented upcoming-audience"
      role="radiogroup"
      :aria-label="$t('upcoming.audience')"
    >
      <button
        v-for="audience in ['close', 'everyone'] as const"
        :key="audience"
        role="radio"
        :aria-checked="preferences.agendaAudience === audience"
        :class="{ active: preferences.agendaAudience === audience }"
        @click="preferences.setAgendaAudience(audience)"
      >
        {{ $t(`upcoming.audiences.${audience}`) }}
      </button>
    </div>

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

    <button v-if="later.length" class="earlier-toggle show-more" @click="horizon += MORE_DAYS">
      <ChevronDown :size="16" />
      {{ $t('upcoming.showMore') }}
      <span class="earlier-toggle__count">{{ later.length }}</span>
    </button>

    <div v-if="!groups.length" class="empty-state card">
      <h2>{{ $t('upcoming.empty') }}</h2>
    </div>

    <button class="floating-action" :aria-label="$t('agendaAdd.title')" @click="showAdd = true">
      <Plus :size="32" />
    </button>
    <AddAgendaItemDialog
      :open="showAdd"
      :candidates="store.people"
      :error="addError"
      @close="showAdd = false"
      @save="save"
    />
  </section>
</template>
