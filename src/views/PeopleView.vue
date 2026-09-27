<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, Plus, Search, Star } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AddPersonDialog from '@/components/AddPersonDialog.vue'
import GoogleContactsDialog from '@/components/GoogleContactsDialog.vue'
import PersonAvatar from '@/components/PersonAvatar.vue'
import ViewHeader from '@/components/ViewHeader.vue'
import { normalizeText } from '@/domain/duplicates'
import { formatPartialDate } from '@/domain/dates'
import type { Person } from '@/domain/model'
import { useKindyStore } from '@/stores/kindy'
import type { ExternalContactsConnection, ExternalContactSnapshot } from '@/domain/ports'

const store = useKindyStore()
const router = useRouter()
const route = useRoute()
const { locale, t } = useI18n()
const query = ref('')
const filter = ref<'all' | 'favorites' | string>(
  typeof route.query.circle === 'string'
    ? route.query.circle
    : route.query.filter === 'favorites'
      ? 'favorites'
      : 'all',
)
const showAddPerson = ref(false)
const showGoogleContacts = ref(route.query.import === 'google')

const filteredPeople = computed(() => {
  const normalizedQuery = normalizeText(query.value)
  const memberships = store.data?.memberships ?? []
  return store.people.filter((person) => {
    const matchesFilter =
      filter.value === 'all' ||
      (filter.value === 'favorites' && person.isFavorite) ||
      memberships.some(
        (membership) => membership.circleId === filter.value && membership.personId === person.id,
      )
    const searchable = normalizeText(
      [person.displayName, person.nickname, ...person.details.map((item) => item.value)]
        .filter(Boolean)
        .join(' '),
    )
    return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery))
  })
})

function personSubtitle(person: Person): string {
  if (person.isDeceased) {
    const date = person.deathDate ? formatPartialDate(person.deathDate, locale.value) : ''
    return date ? t('memorial.listSubtitle', { date }) : t('memorial.inMemory')
  }
  return store
    .circleMemberships(person.id)
    .map((membership) => membership.circle?.name)
    .filter(Boolean)
    .join(' · ')
}

async function addPerson(input: {
  givenName: string
  familyName?: string
  saveToGoogle: boolean
}): Promise<void> {
  const person = await store.addPerson(input)
  showAddPerson.value = false
  await router.push({ name: 'person', params: { id: person.id } })
}

function chooseGoogle(): void {
  showAddPerson.value = false
  showGoogleContacts.value = true
}

async function importGoogleContacts(
  connection: ExternalContactsConnection,
  contacts: ExternalContactSnapshot[],
): Promise<void> {
  await store.importExternalContacts(connection, contacts)
  showGoogleContacts.value = false
  await router.replace({ name: 'people', query: {} })
}
</script>

<template>
  <section class="view people-view">
    <ViewHeader />
    <h1>{{ $t('people.title') }}</h1>

    <label class="search-field">
      <Search :size="22" aria-hidden="true" />
      <span class="sr-only">{{ $t('people.searchPlaceholder') }}</span>
      <input v-model="query" type="search" :placeholder="$t('people.searchPlaceholder')" />
    </label>

    <div class="filter-row" aria-label="Filters">
      <button class="chip" :class="{ 'chip--active': filter === 'all' }" @click="filter = 'all'">
        {{ $t('people.all') }}
      </button>
      <button
        class="chip"
        :class="{ 'chip--active': filter === 'favorites' }"
        @click="filter = 'favorites'"
      >
        <Star :size="16" /> {{ $t('people.favorites') }}
      </button>
      <button
        v-for="circle in store.circles"
        :key="circle.id"
        class="chip"
        :class="[`chip--${circle.colorToken}`, { 'chip--active': filter === circle.id }]"
        @click="filter = circle.id"
      >
        {{ circle.name }}
      </button>
    </div>

    <div v-if="filteredPeople.length" class="person-list">
      <article
        v-for="person in filteredPeople"
        :key="person.id"
        class="person-row"
        :class="{ 'person-row--deceased': person.isDeceased }"
      >
        <button class="person-row__main" @click="router.push(`/people/${person.id}`)">
          <PersonAvatar
            :name="person.displayName"
            :photo-ref="person.photoRef"
            :deceased="person.isDeceased"
          />
          <span class="person-row__copy">
            <strong>{{ person.displayName }}</strong>
            <span>{{ person.isSelf ? $t('me.you') : personSubtitle(person) }}</span>
          </span>
        </button>
        <button
          class="icon-button icon-button--star"
          :aria-label="$t('profile.favorite')"
          @click="store.toggleFavorite(person.id)"
        >
          <Star :size="23" :fill="person.isFavorite ? 'currentColor' : 'none'" />
        </button>
        <ChevronRight :size="21" aria-hidden="true" />
      </article>
    </div>

    <div v-else class="empty-state card">
      <h2>{{ $t('people.empty') }}</h2>
      <p>{{ $t('people.emptyHint') }}</p>
    </div>

    <button class="floating-action" :aria-label="$t('people.add')" @click="showAddPerson = true">
      <Plus :size="32" />
    </button>
    <AddPersonDialog
      :open="showAddPerson"
      :google-available="store.googleLinked"
      @close="showAddPerson = false"
      @google="chooseGoogle"
      @save="addPerson"
    />
    <GoogleContactsDialog
      :open="showGoogleContacts"
      @close="showGoogleContacts = false"
      @import="importGoogleContacts"
    />
  </section>
</template>
