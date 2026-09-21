<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  Heart,
  NotebookPen,
  Sparkles,
  Star,
} from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import PersonAvatar from '@/components/PersonAvatar.vue'
import RelationshipDiagram from '@/components/RelationshipDiagram.vue'
import { ageBetween, formatPartialDate } from '@/domain/dates'
import type { Person } from '@/domain/model'
import { connectedPersonId, relationshipTypeForPerson } from '@/domain/relationships'
import { useKindyStore } from '@/stores/kindy'

const props = defineProps<{ id: string }>()
const store = useKindyStore()
const router = useRouter()
const { locale } = useI18n()
const activeTab = ref<'overview' | 'notes' | 'connections' | 'timeline'>('overview')

watch(
  () => props.id,
  () => {
    activeTab.value = 'overview'
  },
)

const person = computed(() => store.data?.people.find((candidate) => candidate.id === props.id))
const notes = computed(() =>
  (store.data?.notes ?? [])
    .filter((note) => note.personIds.includes(props.id))
    .sort((left, right) => right.occurredAt - left.occurredAt),
)
const relationships = computed(() =>
  (store.data?.relationships ?? [])
    .filter(
      (relationship) =>
        relationship.fromPersonId === props.id || relationship.toPersonId === props.id,
    )
    .map((relationship) => {
      const connectedId = connectedPersonId(relationship, props.id)
      return {
        ...relationship,
        displayType: relationshipTypeForPerson(relationship, props.id),
        displayLabel:
          (relationship.fromPersonId === props.id
            ? relationship.fromPersonLabel
            : relationship.toPersonLabel) ?? relationship.customLabel,
        person: store.data?.people.find((candidate) => candidate.id === connectedId),
      }
    }),
)
const interactions = computed(() =>
  (store.data?.interactions ?? [])
    .filter((interaction) => interaction.personIds.includes(props.id))
    .sort((left, right) => right.occurredAt - left.occurredAt),
)
const circles = computed(() => store.circleMemberships(props.id))
const ageAtDeath = computed(() => {
  if (!person.value?.birthDate || !person.value.deathDate) return null
  return ageBetween(person.value.birthDate, person.value.deathDate)
})

function formatDate(date: NonNullable<Person['birthDate']>): string {
  return formatPartialDate(date, locale.value)
}
</script>

<template>
  <section v-if="person" class="view profile-view">
    <header class="profile-toolbar">
      <button class="icon-button" :aria-label="$t('common.back')" @click="router.back()">
        <ArrowLeft :size="24" />
      </button>
    </header>

    <div class="profile-hero">
      <PersonAvatar
        :name="person.displayName"
        :photo-ref="person.photoRef"
        :deceased="person.isDeceased"
        size="large"
      />
      <div class="profile-hero__copy">
        <div class="profile-name-row">
          <h1>{{ person.displayName }}</h1>
          <button class="icon-button icon-button--star" @click="store.toggleFavorite(person.id)">
            <Star :size="25" :fill="person.isFavorite ? 'currentColor' : 'none'" />
          </button>
        </div>
        <div v-if="person.isDeceased" class="memorial-status">
          <Sparkles :size="15" />
          <span>{{ $t('memorial.inMemory') }}</span>
          <template v-if="person.deathDate">
            <span aria-hidden="true">·</span>
            <span>{{ formatDate(person.deathDate) }}</span>
          </template>
        </div>
        <p v-else>{{ person.howWeMet }}</p>
        <div class="filter-row">
          <span
            v-for="membership in circles"
            :key="membership.circleId"
            class="chip"
            :class="`chip--${membership.circle?.colorToken ?? 'neutral'}`"
          >
            {{ membership.circle?.name }}
          </span>
        </div>
      </div>
    </div>

    <nav class="profile-tabs" aria-label="Profile sections">
      <button
        v-for="tab in ['overview', 'notes', 'connections', 'timeline'] as const"
        :key="tab"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
      >
        {{ $t(`profile.${tab}`) }}
      </button>
    </nav>

    <div v-if="activeTab === 'overview'" class="profile-content">
      <article v-if="person.isDeceased" class="card memorial-card">
        <div class="memorial-card__heading">
          <span class="memorial-card__icon"><Sparkles :size="20" /></span>
          <span>
            <h2>
              {{ $t('memorial.remembering', { name: person.givenName || person.displayName }) }}
            </h2>
            <p v-if="person.memorialNote">{{ person.memorialNote }}</p>
          </span>
        </div>
        <div class="memorial-dates">
          <div v-if="person.birthDate">
            <CalendarDays :size="19" />
            <span>{{ $t('memorial.born') }}</span>
            <strong>{{ formatDate(person.birthDate) }}</strong>
          </div>
          <div v-if="person.deathDate">
            <CalendarDays :size="19" />
            <span>{{ $t('memorial.died') }}</span>
            <strong>{{ formatDate(person.deathDate) }}</strong>
          </div>
          <div v-if="ageAtDeath !== null">
            <Heart :size="19" />
            <span>{{ $t('memorial.age') }}</span>
            <strong>{{ $t('memorial.years', { count: ageAtDeath }) }}</strong>
          </div>
        </div>
      </article>

      <article class="card profile-card">
        <h2>{{ $t('profile.details') }}</h2>
        <p v-if="!person.details.length" class="muted">{{ $t('profile.noDetails') }}</p>
        <div v-for="detail in person.details" :key="detail.id" class="detail-row">
          <BriefcaseBusiness v-if="detail.definitionId === 'occupation'" :size="20" />
          <Heart v-else :size="20" />
          <span>{{ detail.label }}</span>
          <strong>{{ detail.value }}</strong>
        </div>
      </article>

      <article class="card profile-card">
        <h2>{{ $t('profile.closeConnections') }}</h2>
        <p v-if="!relationships.length" class="muted">{{ $t('profile.noConnections') }}</p>
        <button
          v-for="(relationship, index) in relationships.slice(0, 3)"
          :key="relationship.id"
          class="connection-row"
          @click="relationship.person && router.push(`/people/${relationship.person.id}`)"
        >
          <PersonAvatar
            v-if="relationship.person"
            :name="relationship.person.displayName"
            size="small"
            :tone="index + 1"
            :deceased="relationship.person.isDeceased"
          />
          <span>
            <strong>{{ relationship.person?.displayName }}</strong>
            <small>{{ relationship.displayLabel || relationship.displayType }}</small>
          </span>
          <ChevronRight :size="19" />
        </button>
      </article>

      <article v-if="notes[0]" class="card note-card">
        <div class="card-heading-row">
          <h2>{{ $t('profile.latestNote') }}</h2>
          <time>{{
            new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(notes[0].occurredAt)
          }}</time>
        </div>
        <p>{{ notes[0].body }}</p>
      </article>

      <button v-if="!person.isDeceased" class="reminder-callout">
        <Bell :size="20" />
        <span>{{
          store.data?.reminders.find((reminder) => reminder.personId === person?.id)?.title ??
          $t('upcoming.reminder')
        }}</span>
        <ChevronRight :size="19" />
      </button>
    </div>

    <div v-else-if="activeTab === 'notes'" class="profile-content">
      <article v-for="note in notes" :key="note.id" class="card note-card">
        <time>{{
          new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(note.occurredAt)
        }}</time>
        <p>{{ note.body }}</p>
      </article>
      <p v-if="!notes.length" class="empty-copy">{{ $t('profile.noNotes') }}</p>
    </div>

    <div v-else-if="activeTab === 'connections'" class="profile-content">
      <RelationshipDiagram
        v-if="relationships.length"
        :person="person"
        :relationships="relationships"
        @select="router.push(`/people/${$event}`)"
      />
      <p v-if="!relationships.length" class="empty-copy">{{ $t('profile.noConnections') }}</p>
    </div>

    <div v-else class="profile-content">
      <article v-for="interaction in interactions" :key="interaction.id" class="card">
        <strong>{{ interaction.type }}</strong>
        <p>{{ interaction.summary }}</p>
      </article>
      <p v-if="!interactions.length" class="empty-copy">{{ $t('profile.timeline') }}</p>
    </div>

    <button class="wide-action"><NotebookPen :size="21" /> {{ $t('profile.addNote') }}</button>
  </section>
  <section v-else class="center-state">
    <p>{{ $t('search.noResults') }}</p>
    <button class="button button--primary" @click="router.push('/')">
      {{ $t('common.back') }}
    </button>
  </section>
</template>
