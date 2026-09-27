<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Search } from '@lucide/vue'

import { connectionRoles } from '@/domain/connections'
import { normalizeText } from '@/domain/duplicates'
import type { Person, RelationshipRole } from '@/domain/model'

import PersonAvatar from './PersonAvatar.vue'

const props = defineProps<{
  open: boolean
  subject: Person
  candidates: Person[]
  error?: string
}>()
const emit = defineEmits<{
  close: []
  save: [input: { personId: string; role: RelationshipRole }]
}>()

const role = ref<RelationshipRole>('friend')
const personId = ref<string>()
const query = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    role.value = 'friend'
    personId.value = undefined
    query.value = ''
  },
)

const filtered = computed(() => {
  const normalized = normalizeText(query.value)
  return props.candidates.filter(
    (person) =>
      person.id !== props.subject.id &&
      (!normalized || normalizeText(person.displayName).includes(normalized)),
  )
})

function submit(): void {
  if (personId.value) emit('save', { personId: personId.value, role: role.value })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <form class="dialog dialog--scroll" role="dialog" aria-modal="true" @submit.prevent="submit">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ $t('connections.addTitle') }}</h2>

        <p class="dialog-question">
          {{ $t('connections.roleQuestion', { name: subject.givenName ?? subject.displayName }) }}
        </p>
        <div v-for="group in connectionRoles" :key="group.group" class="role-group">
          <span class="generation-label">{{ $t(`connections.groups.${group.group}`) }}</span>
          <div class="role-options">
            <button
              v-for="option in group.roles"
              :key="option"
              type="button"
              class="chip"
              :class="{ 'chip--active': role === option }"
              :aria-pressed="role === option"
              @click="role = option"
            >
              {{ $t(`roles.${option}`) }}
            </button>
          </div>
        </div>

        <p class="dialog-question">{{ $t('connections.choosePerson') }}</p>
        <label class="search-field search-field--compact">
          <Search :size="18" aria-hidden="true" />
          <span class="sr-only">{{ $t('connections.searchPerson') }}</span>
          <input v-model="query" type="search" :placeholder="$t('connections.searchPerson')" />
        </label>
        <div class="choice-list choice-list--people">
          <button
            v-for="person in filtered"
            :key="person.id"
            type="button"
            class="choice-row"
            role="radio"
            :aria-checked="personId === person.id"
            @click="personId = person.id"
          >
            <PersonAvatar
              :name="person.displayName"
              :photo-ref="person.photoRef"
              :deceased="person.isDeceased"
              size="tiny"
            />
            <strong>{{ person.displayName }}</strong>
            <span class="selection-check"><Check v-if="personId === person.id" :size="16" /></span>
          </button>
        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="submit" class="button button--primary" :disabled="!personId">
            {{ $t('connections.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
