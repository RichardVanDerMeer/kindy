<script setup lang="ts">
import { CalendarDays, House, Users, UserRound } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const items = [
  { to: '/', label: 'nav.home', icon: House },
  { to: '/people', label: 'nav.people', icon: UserRound },
  { to: '/circles', label: 'nav.circles', icon: Users },
  { to: '/upcoming', label: 'nav.upcoming', icon: CalendarDays },
]
</script>

<template>
  <nav class="bottom-nav" aria-label="Primary">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="bottom-nav__item"
      exact-active-class="bottom-nav__item--active"
    >
      <component :is="item.icon" :size="23" :stroke-width="1.8" />
      <span>{{ t(item.label) }}</span>
    </RouterLink>
  </nav>
</template>
