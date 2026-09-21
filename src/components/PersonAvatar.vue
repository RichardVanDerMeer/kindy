<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    photoRef?: string
    size?: 'small' | 'medium' | 'large'
    tone?: number
    deceased?: boolean
  }>(),
  { size: 'medium', tone: 0 },
)

const initials = computed(() =>
  props.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join(''),
)
</script>

<template>
  <span
    class="avatar"
    :class="[`avatar--${size}`, `avatar--tone-${tone % 4}`, { 'avatar--deceased': deceased }]"
    :aria-label="name"
  >
    <img v-if="photoRef" :src="photoRef" alt="" />
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>
