<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronRight, Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import AgendaCard from '@/components/AgendaCard.vue'
import CircleCard from '@/components/CircleCard.vue'
import PersonAvatar from '@/components/PersonAvatar.vue'
import ViewHeader from '@/components/ViewHeader.vue'
import type { Person } from '@/domain/model'
import { useKindyStore } from '@/stores/kindy'

const store = useKindyStore()
const router = useRouter()
const { t } = useI18n()
const query = ref('')
const results = ref<Person[]>([])

watch(query, async (value) => {
  results.value = value.trim() ? await store.search(value) : []
})

const greeting = computed(() => {
  const name = store.selfPerson?.givenName
  if (!name) return t('home.greetingFallback')
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return t(`home.${part}`, { name })
})

/** Today plus the coming two weeks; the Upcoming view shows the rest. */
const upcoming = computed(() =>
  store.agenda.filter((item) => item.daysFromToday >= 0 && item.daysFromToday <= 14).slice(0, 4),
)

function subtitle(person: Person): string {
  return store
    .circleMemberships(person.id)
    .map((membership) => membership.circle?.name)
    .filter(Boolean)
    .join(' · ')
}
</script>

<template>
  <section class="view home-view">
    <ViewHeader />
    <h1 class="home-greeting">{{ greeting }}</h1>

    <label class="search-field">
      <Search :size="22" aria-hidden="true" />
      <span class="sr-only">{{ $t('people.searchPlaceholder') }}</span>
      <input v-model="query" type="search" :placeholder="$t('people.searchPlaceholder')" />
    </label>

    <template v-if="query.trim()">
      <section class="home-section">
        <h2 class="section-title">{{ $t('home.results') }}</h2>
        <div v-if="results.length" class="person-list card">
          <button
            v-for="person in results"
            :key="person.id"
            class="person-row person-row--button"
            @click="router.push(`/people/${person.id}`)"
          >
            <PersonAvatar
              :name="person.displayName"
              :photo-ref="person.photoRef"
              :deceased="person.isDeceased"
            />
            <span class="person-row__copy">
              <strong>{{ person.displayName }}</strong>
              <span>{{ subtitle(person) }}</span>
            </span>
            <ChevronRight :size="21" />
          </button>
        </div>
        <p v-else class="empty-copy">{{ $t('search.noResults') }}</p>
      </section>
    </template>

    <template v-else>
      <section class="home-section">
        <header class="section-header">
          <h2 class="section-title">{{ $t('home.upcoming') }}</h2>
          <RouterLink class="section-link" to="/upcoming">
            {{ $t('home.seeAll') }} <ChevronRight :size="16" />
          </RouterLink>
        </header>
        <div v-if="upcoming.length" class="timeline-list">
          <AgendaCard v-for="item in upcoming" :key="item.id" :item="item" compact />
        </div>
        <p v-else class="empty-copy card">{{ $t('home.noUpcoming') }}</p>
      </section>

      <section class="home-section">
        <header class="section-header">
          <h2 class="section-title">{{ $t('home.favoriteCircles') }}</h2>
          <RouterLink class="section-link" to="/circles">
            {{ $t('home.seeAll') }} <ChevronRight :size="16" />
          </RouterLink>
        </header>
        <div v-if="store.favoriteCircles.length" class="scroll-row">
          <CircleCard
            v-for="circle in store.favoriteCircles"
            :key="circle.id"
            :circle="circle"
            compact
            @open="router.push(`/circles/${circle.id}`)"
          />
        </div>
        <p v-else class="empty-copy card">{{ $t('home.noFavoriteCircles') }}</p>
      </section>

      <section class="home-section">
        <header class="section-header">
          <h2 class="section-title">{{ $t('home.favoritePeople') }}</h2>
          <RouterLink
            class="section-link"
            :to="{ path: '/people', query: { filter: 'favorites' } }"
          >
            {{ $t('home.seeAll') }} <ChevronRight :size="16" />
          </RouterLink>
        </header>
        <div v-if="store.favoritePeople.length" class="scroll-row favorite-people">
          <button
            v-for="person in store.favoritePeople"
            :key="person.id"
            class="favorite-person"
            @click="router.push(`/people/${person.id}`)"
          >
            <PersonAvatar
              :name="person.displayName"
              :photo-ref="person.photoRef"
              :deceased="person.isDeceased"
              size="medium"
            />
            <span>{{ person.givenName ?? person.displayName }}</span>
          </button>
        </div>
        <p v-else class="empty-copy card">{{ $t('home.noFavoritePeople') }}</p>
      </section>
    </template>
  </section>
</template>
