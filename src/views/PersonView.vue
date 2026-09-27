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
  Plus,
  Sparkles,
  Star,
  Trash2,
  UserRoundCheck,
  UserRoundPlus,
} from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import AddConnectionDialog from '@/components/AddConnectionDialog.vue'
import CirclePickerDialog from '@/components/CirclePickerDialog.vue'
import PersonAvatar from '@/components/PersonAvatar.vue'
import RelationshipDiagram from '@/components/RelationshipDiagram.vue'
import { inferGender, relationshipViewFor, siblingIds } from '@/domain/connections'
import { ageBetween, formatPartialDate } from '@/domain/dates'
import type { Person, RelationshipRole } from '@/domain/model'
import { connectedPersonId } from '@/domain/relationships'
import { useKindyStore } from '@/stores/kindy'

const props = defineProps<{ id: string }>()
const store = useKindyStore()
const router = useRouter()
const { locale, t } = useI18n()
const activeTab = ref<'overview' | 'notes' | 'connections' | 'timeline'>('overview')
const showCirclePicker = ref(false)
const showAddConnection = ref(false)
const connectionError = ref<string>()

watch(
  () => props.id,
  () => {
    activeTab.value = 'overview'
  },
)

const person = computed(() => store.personById(props.id))
const notes = computed(() =>
  (store.data?.notes ?? [])
    .filter((note) => note.personIds.includes(props.id))
    .sort((left, right) => right.occurredAt - left.occurredAt),
)

const relationships = computed(() =>
  (store.data?.relationships ?? [])
    .filter(
      (relationship) =>
        !relationship.endedOn &&
        (relationship.fromPersonId === props.id || relationship.toPersonId === props.id),
    )
    .map((relationship) => {
      const view = relationshipViewFor(relationship, props.id)
      return {
        id: relationship.id,
        displayType: view.type,
        displayLabel: view.label ?? (view.role ? t(`roles.${view.role}`) : undefined),
        person: store.personById(connectedPersonId(relationship, props.id)),
      }
    }),
)

function siblingRole(personId: string): 'brother' | 'sister' | 'sibling' {
  const gender = inferGender(personId, store.data?.relationships ?? [])
  return gender === 'male' ? 'brother' : gender === 'female' ? 'sister' : 'sibling'
}

/** Brothers and sisters, including those derived from shared parents. */
const siblings = computed(() => {
  const explicit = new Map(
    relationships.value
      .filter((relationship) => relationship.displayType === 'sibling-of')
      .map((relationship) => [relationship.person?.id, relationship]),
  )
  return siblingIds(props.id, store.data?.relationships ?? [])
    .map((id) => {
      const existing = explicit.get(id)
      if (existing) return existing
      return {
        id: `derived-${id}`,
        displayType: 'sibling-of' as const,
        displayLabel: t(`roles.${siblingRole(id)}`),
        person: store.personById(id),
      }
    })
    .filter((relationship) => relationship.person)
})

const diagramRelationships = computed(() => [
  ...relationships.value.filter((relationship) => relationship.displayType !== 'sibling-of'),
  ...siblings.value,
])

const interactions = computed(() =>
  (store.data?.interactions ?? [])
    .filter((interaction) => interaction.personIds.includes(props.id))
    .sort((left, right) => right.occurredAt - left.occurredAt),
)
const circles = computed(() => store.circleMemberships(props.id))
const reminder = computed(() =>
  store.data?.reminders.find(
    (candidate) => candidate.personId === props.id && !candidate.isCancelled,
  ),
)
const ageAtDeath = computed(() => {
  if (!person.value?.birthDate || !person.value.deathDate) return null
  return ageBetween(person.value.birthDate, person.value.deathDate)
})

function formatDate(date: NonNullable<Person['birthDate']>): string {
  return formatPartialDate(date, locale.value)
}

async function saveCircles(circleIds: string[]): Promise<void> {
  await store.setPersonCircles(props.id, circleIds)
  showCirclePicker.value = false
}

function openAddConnection(): void {
  connectionError.value = undefined
  showAddConnection.value = true
}

async function addConnection(input: { personId: string; role: RelationshipRole }): Promise<void> {
  try {
    await store.addConnection(props.id, input.personId, input.role)
    showAddConnection.value = false
  } catch {
    connectionError.value = t('connections.exists')
  }
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
          <button
            v-if="!person.isSelf"
            class="icon-button icon-button--star"
            :aria-label="$t('profile.favorite')"
            :aria-pressed="person.isFavorite"
            @click="store.toggleFavorite(person.id)"
          >
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
        <span v-else-if="person.isSelf" class="self-pill">
          <UserRoundCheck :size="15" /> {{ $t('profile.thisIsYou') }}
        </span>
        <button
          v-else-if="!store.selfPerson"
          class="self-pill self-pill--action"
          @click="store.setSelf(person.id)"
        >
          <UserRoundCheck :size="15" /> {{ $t('profile.markAsMe') }}
        </button>
        <div class="filter-row profile-circles">
          <span
            v-for="membership in circles"
            :key="membership.circleId"
            class="chip"
            :class="`chip--${membership.circle?.colorToken ?? 'neutral'}`"
          >
            {{ membership.circle?.name }}
          </span>
          <button class="chip chip--add" @click="showCirclePicker = true">
            <Plus :size="16" /> {{ $t('profile.addCircle') }}
          </button>
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
          v-for="relationship in relationships.slice(0, 4)"
          :key="relationship.id"
          class="connection-row"
          @click="relationship.person && router.push(`/people/${relationship.person.id}`)"
        >
          <PersonAvatar
            v-if="relationship.person"
            :name="relationship.person.displayName"
            :photo-ref="relationship.person.photoRef"
            size="small"
            :deceased="relationship.person.isDeceased"
          />
          <span>
            <strong>{{ relationship.person?.displayName }}</strong>
            <small>{{ relationship.displayLabel || relationship.displayType }}</small>
          </span>
          <ChevronRight :size="19" />
        </button>
        <button class="inline-action" @click="openAddConnection">
          <UserRoundPlus :size="18" /> {{ $t('profile.addConnection') }}
        </button>
      </article>

      <article v-if="notes[0]" class="card note-card">
        <div class="card-heading-row">
          <h2>{{ $t('profile.latestNote') }}</h2>
          <time>{{
            new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(notes[0].occurredAt)
          }}</time>
        </div>
        <p>{{ notes[0].body }}</p>
      </article>

      <RouterLink v-if="reminder && !person.isDeceased" class="reminder-callout" to="/upcoming">
        <Bell :size="20" />
        <span>{{ reminder.title }}</span>
        <ChevronRight :size="19" />
      </RouterLink>
    </div>

    <div v-else-if="activeTab === 'notes'" class="profile-content">
      <article v-for="note in notes" :key="note.id" class="card note-card">
        <time>{{
          new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(note.occurredAt)
        }}</time>
        <p>{{ note.body }}</p>
      </article>
      <p v-if="!notes.length" class="empty-copy">{{ $t('profile.noNotes') }}</p>
    </div>

    <div v-else-if="activeTab === 'connections'" class="profile-content">
      <RelationshipDiagram
        v-if="diagramRelationships.length"
        :person="person"
        :relationships="diagramRelationships"
        @select="router.push(`/people/${$event}`)"
      />
      <p v-else class="empty-copy">{{ $t('profile.noConnections') }}</p>

      <button class="button button--ghost settings-wide-button" @click="openAddConnection">
        <UserRoundPlus :size="18" /> {{ $t('profile.addConnection') }}
      </button>

      <article v-if="relationships.length" class="card profile-card">
        <h2>{{ $t('profile.manageConnections') }}</h2>
        <div v-for="relationship in relationships" :key="relationship.id" class="manage-row">
          <PersonAvatar
            v-if="relationship.person"
            :name="relationship.person.displayName"
            :photo-ref="relationship.person.photoRef"
            :deceased="relationship.person.isDeceased"
            size="tiny"
          />
          <span>
            <strong>{{ relationship.person?.displayName }}</strong>
            <small>{{ relationship.displayLabel || relationship.displayType }}</small>
          </span>
          <button
            class="icon-button icon-button--danger"
            :aria-label="
              $t('profile.removeConnection', { name: relationship.person?.displayName ?? '' })
            "
            @click="store.removeConnection(relationship.id)"
          >
            <Trash2 :size="18" />
          </button>
        </div>
      </article>
    </div>

    <div v-else class="profile-content">
      <article v-for="interaction in interactions" :key="interaction.id" class="card">
        <strong>{{ interaction.type }}</strong>
        <p>{{ interaction.summary }}</p>
      </article>
      <p v-if="!interactions.length" class="empty-copy">{{ $t('profile.timeline') }}</p>
    </div>

    <button class="wide-action"><NotebookPen :size="21" /> {{ $t('profile.addNote') }}</button>

    <CirclePickerDialog
      :open="showCirclePicker"
      :person-name="person.givenName ?? person.displayName"
      :circles="store.circles"
      :selected-ids="circles.map((membership) => membership.circleId)"
      @close="showCirclePicker = false"
      @save="saveCircles"
    />
    <AddConnectionDialog
      :open="showAddConnection"
      :subject="person"
      :candidates="store.people"
      :error="connectionError"
      @close="showAddConnection = false"
      @save="addConnection"
    />
  </section>
  <section v-else class="center-state">
    <p>{{ $t('search.noResults') }}</p>
    <button class="button button--primary" @click="router.push('/')">
      {{ $t('common.back') }}
    </button>
  </section>
</template>
