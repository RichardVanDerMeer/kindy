<script setup lang="ts">
import { BriefcaseBusiness, Home, Users } from '@lucide/vue'

import PersonAvatar from '@/components/PersonAvatar.vue'
import ViewHeader from '@/components/ViewHeader.vue'
import { useKindyStore } from '@/stores/kindy'

const store = useKindyStore()

function members(circleId: string) {
  const ids = (store.data?.memberships ?? [])
    .filter((membership) => membership.circleId === circleId && !membership.endedOn)
    .map((membership) => membership.personId)
  return store.people.filter((person) => ids.includes(person.id))
}

function icon(iconKey: string) {
  if (iconKey === 'home') return Home
  if (iconKey === 'briefcase') return BriefcaseBusiness
  return Users
}
</script>

<template>
  <section class="view">
    <ViewHeader />
    <h1>{{ $t('circles.title') }}</h1>
    <div v-if="store.circles.length" class="circle-grid">
      <article
        v-for="circle in store.circles"
        :key="circle.id"
        class="card circle-card"
        :class="`surface--${circle.colorToken}`"
      >
        <component :is="icon(circle.iconKey)" :size="28" />
        <h2>{{ circle.name }}</h2>
        <p>{{ $t('circles.members', { count: members(circle.id).length }) }}</p>
        <div class="avatar-stack">
          <PersonAvatar
            v-for="(person, index) in members(circle.id).slice(0, 4)"
            :key="person.id"
            :name="person.displayName"
            size="small"
            :tone="index"
          />
        </div>
      </article>
    </div>
    <div v-else class="empty-state card"><h2>{{ $t('circles.empty') }}</h2></div>
  </section>
</template>
