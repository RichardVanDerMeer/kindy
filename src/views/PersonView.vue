<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  Cake,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Flower2,
  Heart,
  HeartCrack,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  NotebookPen,
  CloudOff,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Star,
  Trash2,
  UserRoundCheck,
  UserRoundPlus,
} from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import AddAgendaItemDialog from '@/components/AddAgendaItemDialog.vue'
import AddConnectionDialog, { type NewPersonInput } from '@/components/AddConnectionDialog.vue'
import AgendaCard from '@/components/AgendaCard.vue'
import AddNoteDialog from '@/components/AddNoteDialog.vue'
import CirclePickerDialog from '@/components/CirclePickerDialog.vue'
import AppointmentsCard from '@/components/AppointmentsCard.vue'
import ContactSyncBadge from '@/components/ContactSyncBadge.vue'
import EditPersonDialog from '@/components/EditPersonDialog.vue'
import WishlistCard from '@/components/WishlistCard.vue'
import PersonAvatar from '@/components/PersonAvatar.vue'
import RelationshipDiagram from '@/components/RelationshipDiagram.vue'
import { calendarDay } from '@/domain/agenda'
import type { AgendaDraft } from '@/domain/agendaDraft'
import { inferGender, relationshipViewFor, siblingIds } from '@/domain/connections'
import { ageBetween, formatPartialDate } from '@/domain/dates'
import { safeWebUrl } from '@/domain/links'
import { mapsUrl } from '@/domain/maps'
import type { PartialDate, Person, RelationshipRole, SyncField } from '@/domain/model'
import { connectedPersonId } from '@/domain/relationships'
import { personTimeline, type TimelineEntry } from '@/domain/timeline'
import { useKindyStore } from '@/stores/kindy'

type Tab = 'overview' | 'notes' | 'connections' | 'timeline'

const props = defineProps<{ id: string }>()
const store = useKindyStore()
const router = useRouter()
const { locale, t } = useI18n()
const activeTab = ref<Tab>('overview')
const showCirclePicker = ref(false)
const showAddConnection = ref(false)
const showAddNote = ref(false)
const showEdit = ref(false)
const showAddDate = ref(false)
const addDateError = ref<string>()
/** Removing a date takes two taps: the first asks for confirmation. */
const confirmingRemoval = ref<string>()

/** For linked people: fields the user chose to keep in Kindy only. */
function localOnly(field: SyncField): boolean {
  return Boolean(person.value?.syncExclusions?.includes(field)) && store.linkedToGoogle(props.id)
}
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
const birthdayToday = computed(() => {
  const date = person.value?.birthDate
  if (!date || person.value?.isDeceased) return false
  const today = calendarDay(new Date())
  return date.month === today.month && date.day === today.day
})
const age = computed(() => {
  if (!person.value?.birthDate || person.value.isDeceased) return null
  return ageBetween(person.value.birthDate, calendarDay(new Date()))
})

const phones = computed(
  () => person.value?.contactPoints.filter((point) => point.kind === 'phone') ?? [],
)
const emails = computed(
  () => person.value?.contactPoints.filter((point) => point.kind === 'email') ?? [],
)
const addresses = computed(
  () => person.value?.contactPoints.filter((point) => point.kind === 'address') ?? [],
)
const links = computed(
  () => person.value?.contactPoints.filter((point) => point.kind === 'url') ?? [],
)

/** Wedding days this person shares, with the partner(s) on the other side. */
const weddings = computed(() =>
  (store.data?.events ?? [])
    .filter((event) => event.type === 'wedding-anniversary' && event.personIds.includes(props.id))
    .map((event) => ({
      id: event.id,
      date: event.date,
      partners: event.personIds
        .filter((id) => id !== props.id)
        .map((id) => store.personById(id))
        .filter((partner): partner is Person => Boolean(partner)),
    })),
)

const hasDetails = computed(
  () =>
    Boolean(person.value?.details.length) ||
    Boolean(person.value?.contactPoints.length) ||
    Boolean(person.value?.birthDate && !person.value.isDeceased) ||
    weddings.value.length > 0,
)

const timeline = computed(() =>
  store.data ? personTimeline(props.id, store.data) : { dated: [], undated: [] },
)
/** What is coming for this person: birthday (and age), anniversaries, appointments, memos. */
const upcomingForPerson = computed(() =>
  store.agenda
    .filter((item) => item.daysFromToday >= 0 && item.personIds.includes(props.id))
    .slice(0, 6),
)
/** The life story so far; future moments are shown under "coming up" instead. */
const pastTimeline = computed(() => {
  const today = calendarDay(new Date())
  const todayKey = today.year * 10_000 + today.month * 100 + today.day
  return timeline.value.dated.filter(
    (entry) => (entry.date.year ?? 0) * 10_000 + entry.date.month * 100 + entry.date.day < todayKey,
  )
})
const removableKinds = new Set(['married', 'anniversary', 'divorced', 'custom'])
const syncedPersonIds = computed(() =>
  store.googleWriteBack
    ? (store.data?.externalIdentities ?? []).map((identity) => identity.personId)
    : [],
)

async function removeTimelineEvent(entry: TimelineEntry): Promise<void> {
  if (confirmingRemoval.value !== entry.id) {
    confirmingRemoval.value = entry.id
    return
  }
  confirmingRemoval.value = undefined
  await store.removeEvent(entry.id)
}

async function addDate(draft: AgendaDraft): Promise<void> {
  addDateError.value = undefined
  try {
    await store.addFromDraft(draft)
    showAddDate.value = false
  } catch {
    addDateError.value = t('agendaAdd.appointment.failed')
  }
}

function formatDate(date: PartialDate): string {
  return formatPartialDate(date, locale.value)
}

function whatsapp(value: string): string {
  return `https://wa.me/${value.replace(/[^\d]/g, '')}`
}

function timelineTitle(entry: TimelineEntry): string {
  const names = entry.otherPersonIds
    .map((id) => {
      const other = store.personById(id)
      return other?.givenName ?? other?.displayName
    })
    .filter(Boolean)
    .join(' & ')
  switch (entry.kind) {
    case 'born':
      return t('timeline.born')
    case 'died':
      return t('timeline.died')
    case 'married':
      return names ? t('timeline.marriedTo', { names }) : t('timeline.married')
    case 'divorced':
      return names ? t('timeline.divorcedFrom', { names }) : t('timeline.divorced')
    default:
      return entry.title ?? t(`timeline.${entry.kind}`)
  }
}

function timelineIcon(entry: TimelineEntry) {
  switch (entry.kind) {
    case 'born':
      return Cake
    case 'married':
    case 'anniversary':
      return Heart
    case 'died':
      return Flower2
    case 'divorced':
      return HeartCrack
    case 'memo':
      return Bell
    case 'appointment':
      return CalendarClock
    case 'custom':
      return CalendarPlus
    default:
      return CalendarDays
  }
}

function timelinePeople(entry: TimelineEntry): Person[] {
  if (entry.kind !== 'married' && entry.kind !== 'anniversary' && entry.kind !== 'divorced') {
    return []
  }
  return [props.id, ...entry.otherPersonIds]
    .map((id) => store.personById(id))
    .filter((candidate): candidate is Person => Boolean(candidate))
}

async function saveCircles(circleIds: string[]): Promise<void> {
  await store.setPersonCircles(props.id, circleIds)
  showCirclePicker.value = false
}

function openAddConnection(): void {
  connectionError.value = undefined
  showAddConnection.value = true
}

async function addConnection(
  input:
    | { personId: string; role: RelationshipRole }
    | { newPerson: NewPersonInput; role: RelationshipRole },
): Promise<void> {
  try {
    // A new connection is always a real person: create them first, then link.
    const personId =
      'personId' in input ? input.personId : (await store.addPerson(input.newPerson)).id
    await store.addConnection(props.id, personId, input.role)
    showAddConnection.value = false
  } catch {
    connectionError.value = t('connections.exists')
  }
}

async function saveNote(input: { body: string; occurredAt: number }): Promise<void> {
  await store.addNote({ personIds: [props.id], ...input })
  showAddNote.value = false
}
</script>

<template>
  <section v-if="person" class="view profile-view">
    <header class="profile-toolbar">
      <button class="icon-button" :aria-label="$t('common.back')" @click="router.back()">
        <ArrowLeft :size="24" />
      </button>
      <button class="icon-button" :aria-label="$t('profile.edit')" @click="showEdit = true">
        <Pencil :size="21" />
      </button>
    </header>

    <div class="profile-hero">
      <button class="avatar-button" :aria-label="$t('edit.photo')" @click="showEdit = true">
        <PersonAvatar
          :name="person.displayName"
          :photo-ref="person.photoRef"
          :deceased="person.isDeceased"
          size="large"
        />
      </button>
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
        <span v-if="birthdayToday" class="self-pill self-pill--birthday">
          <Cake :size="15" /> {{ $t('profile.birthdayToday') }}
        </span>
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
          <RouterLink
            v-for="membership in circles"
            :key="membership.circleId"
            class="chip"
            :class="`chip--${membership.circle?.colorToken ?? 'neutral'}`"
            :to="`/circles/${membership.circleId}`"
          >
            {{ membership.circle?.name }}
          </RouterLink>
          <button class="chip chip--add" @click="showCirclePicker = true">
            <Plus :size="16" /> {{ $t('profile.addCircle') }}
          </button>
        </div>
      </div>
    </div>

    <nav class="profile-tabs" :aria-label="$t('profile.sections')">
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
        <div class="card-heading-row card-heading-row--wrap">
          <h2>{{ $t('profile.details') }}</h2>
          <ContactSyncBadge :person-id="person.id" />
        </div>
        <p v-if="!hasDetails" class="muted">{{ $t('profile.noDetails') }}</p>

        <div v-if="person.birthDate && !person.isDeceased" class="detail-row">
          <Cake :size="20" />
          <span
            >{{ $t('profile.birthDate') }}
            <CloudOff v-if="localOnly('birthday')" :size="13" :aria-label="$t('edit.localOnly')"
          /></span>
          <strong>
            {{ formatDate(person.birthDate) }}
            <small v-if="age !== null" class="detail-meta">{{
              $t('memorial.years', { count: age })
            }}</small>
          </strong>
        </div>

        <div v-for="wedding in weddings" :key="wedding.id" class="detail-row">
          <Heart :size="20" />
          <span>{{ $t('profile.weddingDay') }}</span>
          <strong class="detail-with-people">
            <span>{{ formatDate(wedding.date) }}</span>
            <span
              class="avatar-pair"
              :aria-label="wedding.partners.map((partner) => partner.displayName).join(', ')"
            >
              <PersonAvatar
                :name="person.displayName"
                :photo-ref="person.photoRef"
                :deceased="person.isDeceased"
                size="tiny"
              />
              <PersonAvatar
                v-for="partner in wedding.partners"
                :key="partner.id"
                :name="partner.displayName"
                :photo-ref="partner.photoRef"
                :deceased="partner.isDeceased"
                size="tiny"
              />
            </span>
          </strong>
        </div>

        <div v-for="point in phones" :key="point.id" class="detail-row detail-row--contact">
          <Phone :size="20" />
          <span
            >{{ point.label }}
            <CloudOff v-if="localOnly('phones')" :size="13" :aria-label="$t('edit.localOnly')"
          /></span>
          <strong class="detail-with-actions">
            <a :href="`tel:${point.value}`">{{ point.value }}</a>
            <span v-if="!person.isDeceased" class="detail-actions">
              <a
                class="contact-action"
                :href="`tel:${point.value}`"
                :aria-label="$t('upcoming.call', { name: person.givenName ?? person.displayName })"
                ><Phone :size="17"
              /></a>
              <a
                class="contact-action contact-action--whatsapp"
                :href="whatsapp(point.value)"
                target="_blank"
                rel="noopener"
                :aria-label="
                  $t('upcoming.whatsapp', { name: person.givenName ?? person.displayName })
                "
                ><MessageCircle :size="17"
              /></a>
            </span>
          </strong>
        </div>

        <div v-for="point in emails" :key="point.id" class="detail-row detail-row--contact">
          <Mail :size="20" />
          <span
            >{{ point.label }}
            <CloudOff v-if="localOnly('emails')" :size="13" :aria-label="$t('edit.localOnly')"
          /></span>
          <strong class="detail-with-actions">
            <a :href="`mailto:${point.value}`">{{ point.value }}</a>
          </strong>
        </div>

        <div v-for="point in addresses" :key="point.id" class="detail-row detail-row--contact">
          <MapPin :size="20" />
          <span>{{ $t('profile.address') }}</span>
          <strong class="detail-with-actions">
            <a :href="mapsUrl(point.value)" target="_blank" rel="noopener">{{ point.value }}</a>
            <span class="detail-actions">
              <a
                class="contact-action"
                :href="mapsUrl(point.value)"
                target="_blank"
                rel="noopener"
                :aria-label="$t('profile.openInMaps')"
                ><Navigation :size="17"
              /></a>
            </span>
          </strong>
        </div>

        <div v-for="point in links" :key="point.id" class="detail-row">
          <Link2 :size="20" />
          <span>{{ point.label }}</span>
          <strong>
            <a
              v-if="safeWebUrl(point.value)"
              :href="safeWebUrl(point.value)"
              target="_blank"
              rel="noopener"
              >{{ point.value }}</a
            >
            <template v-else>{{ point.value }}</template>
          </strong>
        </div>

        <div v-for="detail in person.details" :key="detail.id" class="detail-row">
          <BriefcaseBusiness v-if="detail.definitionId === 'occupation'" :size="20" />
          <Heart v-else :size="20" />
          <span>{{ detail.label }}</span>
          <strong>{{ detail.value }}</strong>
        </div>
      </article>

      <WishlistCard v-if="!person.isDeceased" :person-id="person.id" />

      <article class="card note-card note-card--preview">
        <div class="card-heading-row">
          <h2>{{ notes[0] ? $t('profile.latestNote') : $t('profile.notes') }}</h2>
          <time v-if="notes[0]">{{
            new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(notes[0].occurredAt)
          }}</time>
        </div>
        <p v-if="notes[0]">{{ notes[0].body }}</p>
        <p v-else class="muted">{{ $t('profile.noNotes') }}</p>
        <button class="inline-action" @click="activeTab = 'notes'">
          <NotebookPen :size="18" />
          {{
            notes.length ? $t('profile.allNotes', { count: notes.length }) : $t('profile.toNotes')
          }}
          <ChevronRight :size="16" />
        </button>
      </article>

      <AppointmentsCard v-if="!person.isDeceased" :person-id="person.id" />

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

      <RouterLink v-if="reminder && !person.isDeceased" class="reminder-callout" to="/upcoming">
        <Bell :size="20" />
        <span>{{ reminder.title }}</span>
        <ChevronRight :size="19" />
      </RouterLink>
    </div>

    <div v-else-if="activeTab === 'notes'" class="profile-content">
      <button class="wide-action wide-action--top" @click="showAddNote = true">
        <NotebookPen :size="21" /> {{ $t('profile.addNote') }}
      </button>
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
      <button class="button button--ghost settings-wide-button" @click="showAddDate = true">
        <CalendarPlus :size="18" /> {{ $t('timeline.addDate') }}
      </button>

      <template v-if="upcomingForPerson.length">
        <h2 class="section-title">{{ $t('home.upcoming') }}</h2>
        <div class="timeline-list">
          <AgendaCard v-for="item in upcomingForPerson" :key="item.id" :item="item" compact />
        </div>
        <h2 class="section-title timeline-past-title">{{ $t('timeline.lifeSoFar') }}</h2>
      </template>

      <ol v-if="pastTimeline.length" class="life-timeline">
        <li
          v-for="entry in pastTimeline"
          :key="entry.id"
          class="life-timeline__entry"
          :class="`life-timeline__entry--${entry.kind}`"
        >
          <span class="life-timeline__dot" aria-hidden="true">
            <component :is="timelineIcon(entry)" :size="15" />
          </span>
          <div class="life-timeline__body card">
            <button
              v-if="removableKinds.has(entry.kind)"
              class="life-timeline__remove"
              :class="{ 'life-timeline__remove--confirm': confirmingRemoval === entry.id }"
              :aria-label="$t('timeline.remove')"
              @click="removeTimelineEvent(entry)"
            >
              <template v-if="confirmingRemoval === entry.id">{{
                $t('timeline.confirmRemove')
              }}</template>
              <Trash2 v-else :size="15" />
            </button>
            <time>{{ formatDate(entry.date) }}</time>
            <strong>{{ timelineTitle(entry) }}</strong>
            <span v-if="timelinePeople(entry).length > 1" class="avatar-pair">
              <PersonAvatar
                v-for="participant in timelinePeople(entry)"
                :key="participant.id"
                :name="participant.displayName"
                :photo-ref="participant.photoRef"
                :deceased="participant.isDeceased"
                size="tiny"
              />
            </span>
          </div>
        </li>
      </ol>
      <template v-if="timeline.undated.length">
        <h2 class="section-title">{{ $t('timeline.withoutYear') }}</h2>
        <article
          v-for="entry in timeline.undated"
          :key="entry.id"
          class="card life-timeline__body life-timeline__body--undated"
        >
          <time>{{ formatDate(entry.date) }}</time>
          <strong>{{ timelineTitle(entry) }}</strong>
        </article>
      </template>
      <p
        v-if="!pastTimeline.length && !timeline.undated.length && !upcomingForPerson.length"
        class="empty-copy"
      >
        {{ $t('timeline.empty') }}
      </p>
    </div>

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
      :google-available="store.googleLinked"
      :error="connectionError"
      @close="showAddConnection = false"
      @save="addConnection"
    />
    <AddAgendaItemDialog
      :open="showAddDate"
      :candidates="store.people"
      :synced-person-ids="syncedPersonIds"
      :kinds="['birthday', 'wedding', 'divorce', 'death', 'custom', 'memo', 'appointment']"
      :initial-person-ids="[person.id]"
      :error="addDateError"
      @close="showAddDate = false"
      @save="addDate"
    />
    <EditPersonDialog
      :open="showEdit"
      :person="person"
      @close="showEdit = false"
      @saved="showEdit = false"
    />
    <AddNoteDialog
      :open="showAddNote"
      :person-name="person.givenName ?? person.displayName"
      @close="showAddNote = false"
      @save="saveNote"
    />
  </section>
  <section v-else class="center-state">
    <p>{{ $t('search.noResults') }}</p>
    <button class="button button--primary" @click="router.push('/')">
      {{ $t('common.back') }}
    </button>
  </section>
</template>
