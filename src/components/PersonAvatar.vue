<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    photoRef?: string
    size?: 'tiny' | 'small' | 'medium' | 'large'
    deceased?: boolean
  }>(),
  { size: 'medium' },
)

const initials = computed(
  () =>
    props.name
      .split(/\s+/)
      .filter((part) => part && part.charAt(0) === part.charAt(0).toLocaleUpperCase())
      .slice(0, 2)
      .map((part) => part.charAt(0).toLocaleUpperCase())
      .join('') || props.name.charAt(0).toLocaleUpperCase(),
)

/** A stable tone per name, so the same person keeps the same colour everywhere. */
const toneClass = computed(() => {
  let hash = 0
  for (const character of props.name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return `avatar--tone-${hash % 4}`
})
</script>

<template>
  <span
    class="avatar"
    :class="[`avatar--${size}`, toneClass, { 'avatar--deceased': deceased }]"
    role="img"
    :aria-label="name"
  >
    <img v-if="photoRef" :src="photoRef" alt="" />
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>
