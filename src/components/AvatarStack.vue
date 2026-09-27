<script setup lang="ts">
import { computed } from 'vue'

import { circleAvatarStack } from '@/domain/circles'
import type { Person } from '@/domain/model'

import PersonAvatar from './PersonAvatar.vue'

const props = withDefaults(defineProps<{ people: Person[]; max?: number }>(), { max: 6 })

const stack = computed(() => circleAvatarStack(props.people, props.max))
</script>

<template>
  <div class="avatar-stack">
    <span
      v-if="stack.overflow"
      class="avatar avatar--tiny avatar-stack__overflow"
      role="img"
      :aria-label="$t('circles.others', { count: stack.overflow })"
      >+{{ stack.overflow }}</span
    >
    <PersonAvatar
      v-for="person in stack.shown"
      :key="person.id"
      :name="person.displayName"
      :photo-ref="person.photoRef"
      :deceased="person.isDeceased"
      size="tiny"
    />
  </div>
</template>
