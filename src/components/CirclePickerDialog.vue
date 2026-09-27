<script setup lang="ts">
import { ref, watch } from 'vue'
import { Check } from '@lucide/vue'

import type { Circle } from '@/domain/model'

import { circleIcon } from './circleIcons'

const props = defineProps<{
  open: boolean
  personName: string
  circles: Circle[]
  selectedIds: string[]
}>()
const emit = defineEmits<{ close: []; save: [circleIds: string[]] }>()

const selected = ref<string[]>([])

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) selected.value = [...props.selectedIds]
  },
)

function toggle(circleId: string): void {
  selected.value = selected.value.includes(circleId)
    ? selected.value.filter((id) => id !== circleId)
    : [...selected.value, circleId]
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ $t('circles.pickTitle', { name: personName }) }}</h2>
        <div class="choice-list">
          <button
            v-for="circle in circles"
            :key="circle.id"
            type="button"
            class="choice-row"
            role="checkbox"
            :aria-checked="selected.includes(circle.id)"
            @click="toggle(circle.id)"
          >
            <span class="choice-row__icon" :class="`surface--${circle.colorToken}`">
              <component :is="circleIcon(circle.iconKey)" :size="20" />
            </span>
            <strong>{{ circle.name }}</strong>
            <span class="selection-check"
              ><Check v-if="selected.includes(circle.id)" :size="16"
            /></span>
          </button>
        </div>
        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="button" class="button button--primary" @click="emit('save', selected)">
            {{ $t('circles.pickSave') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
