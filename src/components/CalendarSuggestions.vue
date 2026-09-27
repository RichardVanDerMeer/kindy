<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarClock, ChevronDown, Link2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import type { LinkSuggestion } from '@/domain/calendar'
import type { Person } from '@/domain/model'
import { useKindyStore } from '@/stores/kindy'

import PersonAvatar from './PersonAvatar.vue'

/** Limit to one person, e.g. on a profile; without it all suggestions are shown. */
const props = withDefaults(defineProps<{ personId?: string; limit?: number }>(), {
  limit: Number.POSITIVE_INFINITY,
})
const showAll = ref(false)
const store = useKindyStore()
const { locale } = useI18n()

const suggestions = computed(() =>
  store.calendarSuggestions.filter(
    (suggestion) => !props.personId || suggestion.personIds.includes(props.personId),
  ),
)
/** Suggestions should not push the agenda itself off the screen. */
const visible = computed(() =>
  showAll.value ? suggestions.value : suggestions.value.slice(0, props.limit),
)

function people(suggestion: LinkSuggestion): Person[] {
  return suggestion.personIds
    .map((id) => store.personById(id))
    .filter((person): person is Person => Boolean(person))
}

function when(suggestion: LinkSuggestion): string {
  const { startsAt, allDay } = suggestion.event
  return new Intl.DateTimeFormat(locale.value, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(startsAt)
}
</script>

<template>
  <section v-if="suggestions.length" class="calendar-suggestions">
    <header>
      <h2 class="section-title"><Link2 :size="15" /> {{ $t('calendar.suggestionsTitle') }}</h2>
      <p class="muted">{{ $t('calendar.suggestionsHint') }}</p>
    </header>
    <article
      v-for="suggestion in visible"
      :key="`${suggestion.event.id}-${suggestion.event.startsAt}`"
      class="card suggestion-card"
    >
      <div class="suggestion-card__main">
        <span class="suggestion-card__icon"><CalendarClock :size="20" /></span>
        <span class="suggestion-card__copy">
          <strong>{{ suggestion.event.title }}</strong>
          <small>{{ when(suggestion) }}</small>
          <small class="suggestion-card__reason">{{
            suggestion.reason === 'attendee'
              ? $t('calendar.reasonAttendee')
              : $t('calendar.reasonTitle')
          }}</small>
        </span>
        <span class="avatar-pair">
          <PersonAvatar
            v-for="person in people(suggestion)"
            :key="person.id"
            :name="person.displayName"
            :photo-ref="person.photoRef"
            size="tiny"
          />
        </span>
      </div>
      <div class="suggestion-card__actions">
        <button class="button button--ghost" @click="store.ignoreCalendarEvent(suggestion.event)">
          {{ $t('calendar.ignore') }}
        </button>
        <button
          class="button button--primary"
          @click="store.linkCalendarEvent(suggestion.event, suggestion.personIds)"
        >
          {{ $t('calendar.link') }}
          {{
            people(suggestion)
              .map((person) => person.givenName ?? person.displayName)
              .join(' & ')
          }}
        </button>
      </div>
    </article>
    <button
      v-if="suggestions.length > visible.length"
      class="earlier-toggle"
      @click="showAll = true"
    >
      <ChevronDown :size="16" />
      {{ $t('calendar.moreSuggestions', { count: suggestions.length - visible.length }) }}
    </button>
  </section>
</template>
