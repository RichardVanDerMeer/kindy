<script setup lang="ts">
import { Bell, CalendarHeart } from '@lucide/vue'

import PersonAvatar from '@/components/PersonAvatar.vue'
import ViewHeader from '@/components/ViewHeader.vue'
import { useKindyStore } from '@/stores/kindy'

const store = useKindyStore()

function peopleFor(ids: string[]) {
  return store.people.filter((person) => ids.includes(person.id))
}
</script>

<template>
  <section class="view">
    <ViewHeader />
    <h1>{{ $t('upcoming.title') }}</h1>
    <div v-if="store.upcoming.length" class="timeline-list">
      <article v-for="item in store.upcoming" :key="item.id" class="card upcoming-card">
        <div class="upcoming-date">
          <strong>{{ new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(item.dueAt) }}</strong>
          <span>{{ new Intl.DateTimeFormat(undefined, { month: 'short' }).format(item.dueAt) }}</span>
        </div>
        <div class="avatar-stack" v-if="item.personIds.length">
          <PersonAvatar
            v-for="(person, index) in peopleFor(item.personIds)"
            :key="person.id"
            :name="person.displayName"
            size="small"
            :tone="index"
          />
        </div>
        <component :is="item.kind === 'event' ? CalendarHeart : Bell" v-else :size="26" />
        <div class="upcoming-card__copy">
          <strong>{{ item.title }}</strong>
          <span>{{ $t(`upcoming.${item.subtitle}`, item.subtitle) }}</span>
        </div>
      </article>
    </div>
    <div v-else class="empty-state card"><h2>{{ $t('upcoming.empty') }}</h2></div>
  </section>
</template>
