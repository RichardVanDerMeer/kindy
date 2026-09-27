<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X } from '@lucide/vue'

import { connectionRoles } from '@/domain/connections'
import type { Person, RelationshipRole } from '@/domain/model'

import PersonPicker from './PersonPicker.vue'

export interface NewPersonInput {
  givenName: string
  familyName?: string
  saveToGoogle: boolean
}

const props = defineProps<{
  open: boolean
  subject: Person
  candidates: Person[]
  googleAvailable: boolean
  error?: string
}>()
const emit = defineEmits<{
  close: []
  save: [
    input:
      | { personId: string; role: RelationshipRole }
      | { newPerson: NewPersonInput; role: RelationshipRole },
  ]
}>()

const role = ref<RelationshipRole>('friend')
const selected = ref<string[]>([])
const personId = computed(() => selected.value[0])
const newPerson = ref<NewPersonInput>()

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    role.value = 'friend'
    selected.value = []
    newPerson.value = undefined
  },
)

const candidates = computed(() =>
  props.candidates.filter((person) => person.id !== props.subject.id),
)

/** Splits a typed name: the first word is the first name, the rest the last name. */
function startNewPerson(name: string): void {
  const [givenName = '', ...rest] = name.trim().split(/\s+/)
  newPerson.value = {
    givenName,
    familyName: rest.join(' ') || undefined,
    saveToGoogle: props.googleAvailable,
  }
  selected.value = []
}

const canSave = computed(() =>
  newPerson.value ? Boolean(newPerson.value.givenName.trim()) : Boolean(personId.value),
)

function submit(): void {
  if (newPerson.value?.givenName.trim()) {
    emit('save', { newPerson: { ...newPerson.value }, role: role.value })
  } else if (personId.value) {
    emit('save', { personId: personId.value, role: role.value })
  }
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

        <template v-if="newPerson">
          <div class="inline-form-heading">
            <p class="dialog-question">{{ $t('connections.newPersonTitle') }}</p>
            <button
              type="button"
              class="icon-button"
              :aria-label="$t('people.cancel')"
              @click="newPerson = undefined"
            >
              <X :size="18" />
            </button>
          </div>
          <div class="field-row">
            <label class="field">
              <span>{{ $t('people.givenName') }}</span>
              <input v-model="newPerson.givenName" required autocomplete="off" />
            </label>
            <label class="field">
              <span>{{ $t('people.familyName') }}</span>
              <input v-model="newPerson.familyName" autocomplete="off" />
            </label>
          </div>
          <label v-if="googleAvailable" class="check-field">
            <input v-model="newPerson.saveToGoogle" type="checkbox" />
            <span>{{ $t('contactSync.saveToGoogle') }}</span>
          </label>
        </template>
        <template v-else>
          <p class="dialog-question">{{ $t('connections.choosePerson') }}</p>
          <PersonPicker
            v-model="selected"
            :candidates="candidates"
            :max="1"
            allow-create
            @create="startNewPerson"
          />
        </template>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="submit" class="button button--primary" :disabled="!canSave">
            {{ $t('connections.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
