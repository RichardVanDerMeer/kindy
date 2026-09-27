<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Search } from '@lucide/vue'

import { normalizeText } from '@/domain/duplicates'
import type { Person } from '@/domain/model'

import PersonAvatar from './PersonAvatar.vue'

/**
 * Searchable list to pick people. With `max` 1 it behaves like a radio group;
 * otherwise it toggles up to `max` people (unlimited when omitted).
 */
const props = defineProps<{ candidates: Person[]; max?: number }>()
const selected = defineModel<string[]>({ required: true })
const query = ref('')

const single = computed(() => props.max === 1)
const filtered = computed(() => {
  const normalized = normalizeText(query.value)
  return props.candidates.filter(
    (person) => !normalized || normalizeText(person.displayName).includes(normalized),
  )
})

function toggle(personId: string): void {
  if (single.value) {
    selected.value = [personId]
    return
  }
  if (selected.value.includes(personId)) {
    selected.value = selected.value.filter((id) => id !== personId)
  } else if (props.max === undefined || selected.value.length < props.max) {
    selected.value = [...selected.value, personId]
  }
}
</script>

<template>
  <div class="person-picker">
    <label class="search-field search-field--compact">
      <Search :size="18" aria-hidden="true" />
      <span class="sr-only">{{ $t('connections.searchPerson') }}</span>
      <input v-model="query" type="search" :placeholder="$t('connections.searchPerson')" />
    </label>
    <div class="choice-list choice-list--people" :role="single ? 'radiogroup' : 'group'">
      <button
        v-for="person in filtered"
        :key="person.id"
        type="button"
        class="choice-row"
        :role="single ? 'radio' : 'checkbox'"
        :aria-checked="selected.includes(person.id)"
        :aria-label="person.displayName"
        @click="toggle(person.id)"
      >
        <PersonAvatar
          :name="person.displayName"
          :photo-ref="person.photoRef"
          :deceased="person.isDeceased"
          size="tiny"
        />
        <strong>{{ person.displayName }}</strong>
        <span class="selection-check"
          ><Check v-if="selected.includes(person.id)" :size="16"
        /></span>
      </button>
    </div>
  </div>
</template>
