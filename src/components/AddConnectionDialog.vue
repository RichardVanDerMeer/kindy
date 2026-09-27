<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { connectionRoles } from '@/domain/connections'
import type { Person, RelationshipRole } from '@/domain/model'

import PersonPicker from './PersonPicker.vue'

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
const selected = ref<string[]>([])
const personId = computed(() => selected.value[0])

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    role.value = 'friend'
    selected.value = []
  },
)

const candidates = computed(() =>
  props.candidates.filter((person) => person.id !== props.subject.id),
)

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
        <PersonPicker v-model="selected" :candidates="candidates" :max="1" />

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
