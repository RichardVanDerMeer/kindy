<script setup lang="ts">
import { computed } from 'vue'
import { Pencil, Star } from '@lucide/vue'

import type { Circle } from '@/domain/model'
import { useKindyStore } from '@/stores/kindy'

import AvatarStack from './AvatarStack.vue'
import { circleIcon } from './circleIcons'

const props = withDefaults(defineProps<{ circle: Circle; compact?: boolean }>(), {
  compact: false,
})
const emit = defineEmits<{ open: []; edit: [] }>()

const store = useKindyStore()
const members = computed(() => store.circleMembers(props.circle.id))
// The user is part of most of their own circles; the stack shows the others.
const others = computed(() => members.value.filter((person) => !person.isSelf))
</script>

<template>
  <article
    class="circle-card"
    :class="[
      `surface--${circle.colorToken}`,
      { 'circle-card--image': circle.backgroundImageRef, 'circle-card--compact': compact },
    ]"
  >
    <img
      v-if="circle.backgroundImageRef"
      class="circle-card__image"
      :src="circle.backgroundImageRef"
      alt=""
    />
    <button class="circle-card__open" :aria-label="circle.name" @click="emit('open')" />
    <div class="circle-card__top">
      <span class="circle-card__icon" aria-hidden="true">
        <component :is="circleIcon(circle.iconKey)" :size="compact ? 20 : 22" />
      </span>
      <span class="circle-card__actions">
        <button
          v-if="!compact"
          class="icon-button icon-button--glass"
          :aria-label="$t('circles.edit')"
          @click="emit('edit')"
        >
          <Pencil :size="18" />
        </button>
        <button
          class="icon-button icon-button--glass icon-button--star"
          :aria-label="$t('circles.favorite')"
          :aria-pressed="circle.isFavorite"
          @click="store.toggleCircleFavorite(circle.id)"
        >
          <Star :size="20" :fill="circle.isFavorite ? 'currentColor' : 'none'" />
        </button>
      </span>
    </div>
    <div class="circle-card__body">
      <h2>{{ circle.name }}</h2>
      <p>
        {{ $t('circles.members', { count: members.length }, members.length) }}
        <template v-if="circle.description && !compact"> · {{ circle.description }}</template>
      </p>
      <AvatarStack :people="others" />
    </div>
  </article>
</template>
