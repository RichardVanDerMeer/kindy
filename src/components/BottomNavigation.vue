<script setup lang="ts">
import { CalendarDays, Search, Users, UserRound } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const items = [
  { to: '/', label: 'nav.people', icon: UserRound },
  { to: '/circles', label: 'nav.circles', icon: Users },
  { to: '/upcoming', label: 'nav.upcoming', icon: CalendarDays },
  { to: '/search', label: 'nav.search', icon: Search },
]
</script>

<template>
  <nav class="bottom-nav" aria-label="Primary">
    <RouterLink v-for="item in items" :key="item.to" :to="item.to" class="bottom-nav__item">
      <component :is="item.icon" :size="23" :stroke-width="1.8" />
      <span>{{ t(item.label) }}</span>
    </RouterLink>
  </nav>
</template>
