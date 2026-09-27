<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Cloud, CloudOff, ImagePlus, Plus, Trash2, X } from '@lucide/vue'

import { readImageFile } from '@/composables/imageFile'
import type { PartialDate, Person, SyncField } from '@/domain/model'
import { useKindyStore, type PersonEdit } from '@/stores/kindy'

import PartialDateInput from './PartialDateInput.vue'
import PersonAvatar from './PersonAvatar.vue'

const props = defineProps<{ open: boolean; person: Person }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const store = useKindyStore()
const draft = ref<PersonEdit>(fromPerson())
const birthDate = ref<PartialDate>()
const syncToGoogle = ref(true)
const fileInput = ref<HTMLInputElement>()
const googlePhotoState = ref<'idle' | 'loading' | 'none'>('idle')

/** Linked contacts sync these fields; the form marks them with a cloud. */
const linked = computed(() => store.linkedToGoogle(props.person.id))
const syncActive = computed(() => linked.value && store.googleWriteBack)
const excluded = computed(() => new Set(props.person.syncExclusions ?? []))

function fromPerson(): PersonEdit {
  const values = (kind: 'phone' | 'email') =>
    props.person.contactPoints.filter((point) => point.kind === kind).map((point) => point.value)
  return {
    givenName: props.person.givenName ?? props.person.displayName,
    familyName: props.person.familyName,
    nickname: props.person.nickname,
    birthDate: props.person.birthDate,
    phones: values('phone'),
    emails: values('email'),
    photoRef: props.person.photoRef,
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    draft.value = fromPerson()
    birthDate.value = props.person.birthDate ? { ...props.person.birthDate } : undefined
    syncToGoogle.value = true
    googlePhotoState.value = 'idle'
  },
)

function syncIcon(field: SyncField) {
  if (!linked.value) return undefined
  return excluded.value.has(field) ? CloudOff : Cloud
}

async function pickPhoto(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  draft.value.photoRef = await readImageFile(file, { maxSize: 512, square: true })
  if (fileInput.value) fileInput.value.value = ''
}

async function useGooglePhoto(): Promise<void> {
  googlePhotoState.value = 'loading'
  const photo = await store.googlePhoto(props.person.id).catch(() => undefined)
  if (photo) {
    draft.value.photoRef = photo
    googlePhotoState.value = 'idle'
  } else {
    googlePhotoState.value = 'none'
  }
}

async function submit(): Promise<void> {
  if (!draft.value.givenName.trim()) return
  await store.updatePerson(
    props.person.id,
    {
      ...draft.value,
      phones: [...draft.value.phones],
      emails: [...draft.value.emails],
      birthDate: birthDate.value ? { ...birthDate.value } : undefined,
    },
    { syncToGoogle: syncActive.value && syncToGoogle.value },
  )
  emit('saved')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <form class="dialog dialog--scroll" role="dialog" aria-modal="true" @submit.prevent="submit">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ $t('edit.title') }}</h2>
        <p v-if="syncActive" class="edit-sync-hint">
          <Cloud :size="15" /> {{ $t('edit.syncHint') }}
        </p>

        <div class="edit-photo">
          <PersonAvatar
            :name="
              [draft.givenName, draft.familyName].filter(Boolean).join(' ') || person.displayName
            "
            :photo-ref="draft.photoRef"
            :deceased="person.isDeceased"
            size="large"
          />
          <div class="edit-photo__actions">
            <span class="field-label">
              {{ $t('edit.photo') }}
              <component
                :is="syncIcon('photo')"
                v-if="syncIcon('photo')"
                :size="14"
                :aria-label="excluded.has('photo') ? $t('edit.localOnly') : $t('edit.syncedField')"
              />
            </span>
            <button type="button" class="button button--ghost" @click="fileInput?.click()">
              <ImagePlus :size="17" /> {{ $t('edit.choosePhoto') }}
            </button>
            <button
              v-if="linked"
              type="button"
              class="button button--ghost"
              :disabled="googlePhotoState === 'loading'"
              @click="useGooglePhoto"
            >
              <span class="google-mark google-mark--small">G</span> {{ $t('edit.googlePhoto') }}
            </button>
            <button
              v-if="draft.photoRef"
              type="button"
              class="button button--ghost"
              @click="draft.photoRef = undefined"
            >
              <Trash2 :size="17" /> {{ $t('edit.removePhoto') }}
            </button>
            <small v-if="googlePhotoState === 'none'" class="muted">{{
              $t('edit.noGooglePhoto')
            }}</small>
          </div>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="pickPhoto" />
        </div>

        <div class="field-row">
          <label class="field">
            <span class="field-label">
              {{ $t('people.givenName') }}
              <component :is="syncIcon('name')" v-if="syncIcon('name')" :size="14" />
            </span>
            <input v-model="draft.givenName" required autocomplete="off" />
          </label>
          <label class="field">
            <span class="field-label">
              {{ $t('people.familyName') }}
              <component :is="syncIcon('name')" v-if="syncIcon('name')" :size="14" />
            </span>
            <input v-model="draft.familyName" autocomplete="off" />
          </label>
        </div>
        <label class="field">
          <span>{{ $t('edit.nickname') }}</span>
          <input v-model="draft.nickname" autocomplete="off" />
        </label>

        <fieldset class="field picker-field">
          <legend class="field-label">
            {{ $t('edit.birthDate') }}
            <component :is="syncIcon('birthday')" v-if="syncIcon('birthday')" :size="14" />
          </legend>
          <PartialDateInput v-model="birthDate" />
        </fieldset>

        <fieldset class="field picker-field">
          <legend class="field-label">
            {{ $t('edit.phones') }}
            <component :is="syncIcon('phones')" v-if="syncIcon('phones')" :size="14" />
          </legend>
          <div v-for="(_, index) in draft.phones" :key="`phone-${index}`" class="list-input">
            <input v-model="draft.phones[index]" type="tel" autocomplete="off" />
            <button
              type="button"
              class="icon-button"
              :aria-label="$t('edit.remove')"
              @click="draft.phones.splice(index, 1)"
            >
              <X :size="18" />
            </button>
          </div>
          <button type="button" class="inline-action" @click="draft.phones.push('')">
            <Plus :size="16" /> {{ $t('edit.addPhone') }}
          </button>
        </fieldset>

        <fieldset class="field picker-field">
          <legend class="field-label">
            {{ $t('edit.emails') }}
            <component :is="syncIcon('emails')" v-if="syncIcon('emails')" :size="14" />
          </legend>
          <div v-for="(_, index) in draft.emails" :key="`email-${index}`" class="list-input">
            <input v-model="draft.emails[index]" type="email" autocomplete="off" />
            <button
              type="button"
              class="icon-button"
              :aria-label="$t('edit.remove')"
              @click="draft.emails.splice(index, 1)"
            >
              <X :size="18" />
            </button>
          </div>
          <button type="button" class="inline-action" @click="draft.emails.push('')">
            <Plus :size="16" /> {{ $t('edit.addEmail') }}
          </button>
        </fieldset>

        <label v-if="syncActive" class="check-field">
          <input v-model="syncToGoogle" type="checkbox" />
          <span>{{ $t('edit.syncToGoogle') }}</span>
        </label>
        <p v-if="syncActive && !syncToGoogle" class="edit-local-hint">
          <CloudOff :size="15" /> {{ $t('edit.keepLocal') }}
        </p>

        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="submit" class="button button--primary" :disabled="!draft.givenName.trim()">
            {{ $t('edit.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
