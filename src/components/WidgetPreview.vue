<script setup lang="ts">
import { computed } from 'vue'

import type { ComingUpSnapshot } from '@/domain/widget'

/** Mirrors the Android widget; it scrolls there, the preview shows the first four. */
const props = defineProps<{ snapshot: ComingUpSnapshot | null }>()

const rows = computed(() => (props.snapshot?.items ?? []).slice(0, 4))

function badge(date: string): { day: string; month: string } {
  const value = new Date(`${date}T12:00:00`)
  const locale = props.snapshot?.locale
  return {
    day: new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(value),
    month: new Intl.DateTimeFormat(locale, { month: 'short' }).format(value).replace('.', ''),
  }
}

const icons: Record<string, string> = {
  birthday: '🎂',
  wedding: '💍',
  work: '💼',
  memorial: '🕯️',
  appointment: '📅',
  reminder: '🔔',
}

function isToday(date: string): boolean {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return date === today
}

function when(date: string): string {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const days = Math.round((new Date(`${date}T12:00:00`).getTime() - today.getTime()) / 86_400_000)
  if (days === 0) return props.snapshot?.labels.today ?? ''
  if (days === 1) return props.snapshot?.labels.tomorrow ?? ''
  return new Intl.DateTimeFormat(props.snapshot?.locale, { weekday: 'long' }).format(
    new Date(`${date}T12:00:00`),
  )
}
</script>

<template>
  <div class="widget-preview" aria-hidden="true">
    <strong class="widget-preview__heading">{{ snapshot?.heading }}</strong>
    <p v-if="!rows.length" class="widget-preview__empty">{{ snapshot?.empty }}</p>
    <div
      v-for="item in rows"
      :key="`${item.date}-${item.title}`"
      class="widget-preview__row"
      :class="{ 'widget-preview__row--festive': item.kind === 'birthday' && isToday(item.date) }"
    >
      <span class="widget-preview__date">
        <strong>{{ badge(item.date).day }}</strong>
        <small>{{ badge(item.date).month }}</small>
      </span>
      <span class="widget-preview__copy">
        <small>{{ icons[item.kind] ?? '⭐' }} {{ item.kindLabel }} · {{ when(item.date) }}</small>
        <strong :class="{ 'widget-preview__birthday': item.kind === 'birthday' }">
          <template v-if="item.kind === 'birthday' && isToday(item.date)">🎉 </template
          >{{ item.title }}
        </strong>
        <small v-if="item.detail">{{ item.detail }}</small>
      </span>
    </div>
  </div>
</template>
