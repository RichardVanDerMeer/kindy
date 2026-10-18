<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, ChevronDown, Plus, UserRound, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import {
  connectionRoleGroups,
  isChildRole,
  isSiblingRole,
  partnerChildSuggestions,
  partnerIds,
  siblingTargets,
} from '@/domain/connections'
import type { Person, Relationship, RelationshipRole } from '@/domain/model'

import PersonAvatar from './PersonAvatar.vue'
import PersonPicker from './PersonPicker.vue'

export interface NewPersonInput {
  givenName: string
  familyName?: string
}

/** One connection being added: who, and who they are to the subject. */
export interface ConnectionDraft {
  personId?: string
  newPerson?: NewPersonInput
  role?: RelationshipRole
}

const props = defineProps<{
  open: boolean
  subject: Person
  candidates: Person[]
  relationships: Relationship[]
  busy?: boolean
}>()
const emit = defineEmits<{
  close: []
  save: [
    connections: ConnectionDraft[],
    options: { alsoForPartnerId?: string; alsoForSiblings?: boolean },
  ]
}>()

const { t } = useI18n()
const rows = ref<ConnectionDraft[]>([{}])
/** The row whose person is being picked; the picker replaces the list meanwhile. */
const picking = ref<number | null>(null)
const pickerSelection = ref<string[]>([])
const alsoForPartner = ref(true)
const alsoForSiblings = ref(true)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    rows.value = [{}]
    picking.value = null
    alsoForPartner.value = true
    alsoForSiblings.value = true
  },
)

const candidates = computed(() =>
  props.candidates.filter((person) => person.id !== props.subject.id),
)
const personById = (id?: string) => props.candidates.find((person) => person.id === id)
const subjectName = computed(() => props.subject.givenName ?? props.subject.displayName)

/** The partner's children who are not yet linked: offered as one-tap rows. */
const suggestions = computed(() =>
  partnerChildSuggestions(props.subject.id, props.relationships)
    .filter((suggestion) => !rows.value.some((row) => row.personId === suggestion.personId))
    .map((suggestion) => ({ ...suggestion, person: personById(suggestion.personId) }))
    .filter((suggestion) => suggestion.person),
)
const partner = computed(() => personById(partnerIds(props.subject.id, props.relationships)[0]))
/** Adding a child: offer to make them the partner's child as well. */
const offersPartner = computed(
  () =>
    Boolean(partner.value) &&
    rows.value.some(
      (row) => row.role && isChildRole(row.role) && row.personId !== partner.value?.id,
    ),
)

/** Adding a brother or sister: offer to place them with the parents or other siblings. */
const siblingOffer = computed(() => {
  if (!rows.value.some((row) => row.role && isSiblingRole(row.role))) return null
  const targets = siblingTargets(props.subject.id, props.relationships)
  if (!targets) return null
  const names = targets.personIds
    .map((id) => personById(id))
    .map((person) => person?.givenName ?? person?.displayName)
    .filter(Boolean)
    .join(' & ')
  return names ? { kind: targets.kind, names } : null
})

function rowName(row: ConnectionDraft): string | undefined {
  if (row.newPerson) return [row.newPerson.givenName, row.newPerson.familyName].join(' ').trim()
  return personById(row.personId)?.displayName
}

const complete = computed(() =>
  rows.value.filter((row) => (row.personId || row.newPerson?.givenName.trim()) && row.role),
)
const canSave = computed(
  () =>
    complete.value.length > 0 &&
    rows.value.every((row) => !rowName(row) || row.role) &&
    !props.busy,
)

function startPicking(index: number): void {
  picking.value = index
  pickerSelection.value = rows.value[index]?.personId ? [rows.value[index].personId] : []
}

watch(pickerSelection, (selection) => {
  if (picking.value === null || !selection[0]) return
  const row = rows.value[picking.value]
  if (row) {
    row.personId = selection[0]
    row.newPerson = undefined
  }
  picking.value = null
})

/** Splits a typed name: the first word is the first name, the rest the last name. */
function createPerson(name: string): void {
  if (picking.value === null) return
  const [givenName = '', ...rest] = name.trim().split(/\s+/)
  const row = rows.value[picking.value]
  if (row) {
    row.newPerson = { givenName, familyName: rest.join(' ') || undefined }
    row.personId = undefined
  }
  picking.value = null
}

function addRow(): void {
  rows.value.push({})
}

function removeRow(index: number): void {
  rows.value.splice(index, 1)
  if (!rows.value.length) rows.value.push({})
}

function useSuggestion(personId: string, role: RelationshipRole): void {
  const empty = rows.value.findIndex((row) => !row.personId && !row.newPerson)
  if (empty >= 0) rows.value[empty] = { personId, role }
  else rows.value.push({ personId, role })
}

function submit(): void {
  if (!canSave.value) return
  emit(
    'save',
    complete.value.map((row) => ({ ...row, newPerson: row.newPerson && { ...row.newPerson } })),
    {
      alsoForPartnerId: offersPartner.value && alsoForPartner.value ? partner.value?.id : undefined,
      alsoForSiblings: Boolean(siblingOffer.value) && alsoForSiblings.value,
    },
  )
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <form
        class="dialog dialog--scroll connection-dialog"
        role="dialog"
        aria-modal="true"
        @submit.prevent="submit"
      >
        <div class="dialog__handle" aria-hidden="true"></div>

        <!-- Picking a person for one row: the familiar search list. -->
        <template v-if="picking !== null">
          <div class="inline-form-heading inline-form-heading--back">
            <button
              type="button"
              class="icon-button"
              :aria-label="t('common.back')"
              @click="picking = null"
            >
              <ArrowLeft :size="20" />
            </button>
            <h2>{{ t('connections.choosePerson') }}</h2>
          </div>
          <PersonPicker
            v-model="pickerSelection"
            :candidates="candidates"
            :max="1"
            allow-create
            @create="createPerson"
          />
        </template>

        <template v-else>
          <h2>{{ t('connections.addTitle') }}</h2>
          <p class="dialog-question">
            {{ t('connections.rowsQuestion', { name: subjectName }) }}
          </p>

          <div v-if="suggestions.length" class="connection-suggestions">
            <span class="generation-label">
              {{ t('connections.partnerChildren', { name: partner?.givenName ?? '' }) }}
            </span>
            <div class="role-options">
              <button
                v-for="suggestion in suggestions"
                :key="suggestion.personId"
                type="button"
                class="chip chip--suggestion"
                @click="useSuggestion(suggestion.personId, suggestion.role)"
              >
                <Plus :size="15" />
                {{ suggestion.person?.givenName ?? suggestion.person?.displayName }}
                <small>{{ t(`roles.${suggestion.role}`) }}</small>
              </button>
            </div>
          </div>

          <TransitionGroup name="row" tag="ul" class="connection-rows">
            <li v-for="(row, index) in rows" :key="index" class="connection-row">
              <button
                type="button"
                class="connection-row__person"
                :class="{ 'connection-row__person--empty': !rowName(row) }"
                @click="startPicking(index)"
              >
                <PersonAvatar
                  v-if="rowName(row)"
                  :name="rowName(row) ?? ''"
                  :photo-ref="personById(row.personId)?.photoRef"
                  size="tiny"
                />
                <UserRound v-else :size="18" aria-hidden="true" />
                <span>{{ rowName(row) ?? t('connections.pickPerson') }}</span>
              </button>
              <label class="connection-row__role">
                <span class="sr-only">{{ t('connections.role') }}</span>
                <select v-model="row.role" :class="{ placeholder: !row.role }">
                  <option :value="undefined" disabled>{{ t('connections.role') }}</option>
                  <optgroup
                    v-for="group in connectionRoleGroups"
                    :key="group.group"
                    :label="t(`connections.roleGroups.${group.group}`)"
                  >
                    <option v-for="role in group.roles" :key="role" :value="role">
                      {{ t(`roles.${role}`) }}
                    </option>
                  </optgroup>
                </select>
                <ChevronDown :size="16" aria-hidden="true" />
              </label>
              <button
                v-if="rows.length > 1 || rowName(row) || row.role"
                type="button"
                class="icon-button connection-row__remove"
                :aria-label="t('connections.removeRow')"
                @click="removeRow(index)"
              >
                <X :size="17" />
              </button>
            </li>
          </TransitionGroup>

          <button type="button" class="inline-action" @click="addRow">
            <Plus :size="16" /> {{ t('connections.addRow') }}
          </button>

          <label v-if="siblingOffer" class="check-field">
            <input v-model="alsoForSiblings" type="checkbox" />
            <span>{{
              siblingOffer.kind === 'parents'
                ? t('connections.alsoParents', { names: siblingOffer.names })
                : t('connections.alsoSiblings', { names: siblingOffer.names })
            }}</span>
          </label>
          <label v-if="offersPartner && partner" class="check-field">
            <input v-model="alsoForPartner" type="checkbox" />
            <span>{{
              t('connections.alsoPartner', { name: partner.givenName ?? partner.displayName })
            }}</span>
          </label>

          <div class="dialog__actions">
            <button type="button" class="button button--ghost" @click="emit('close')">
              {{ t('people.cancel') }}
            </button>
            <button
              type="submit"
              class="button button--primary"
              :disabled="!canSave"
              :aria-busy="busy || undefined"
            >
              {{ t('connections.saveCount', { count: complete.length }, complete.length) }}
            </button>
          </div>
        </template>
      </form>
    </div>
  </Teleport>
</template>
