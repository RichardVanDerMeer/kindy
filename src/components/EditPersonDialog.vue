<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Cloud, CloudOff, ImagePlus, Plus, Trash2, X } from '@lucide/vue'

import { readImageFile } from '@/composables/imageFile'
import { emailLabels, normalizeContactLabel, phoneLabels } from '@/domain/contactLabels'
import type { PartialDate, Person, SyncField } from '@/domain/model'
import { jobsOf } from '@/domain/jobs'
import { isSocialPlatform, socialPlatforms } from '@/domain/social'
import { useKindyStore, type PersonEdit } from '@/stores/kindy'

import LabelledListInput from './LabelledListInput.vue'
import PartialDateInput from './PartialDateInput.vue'
import PersonAvatar from './PersonAvatar.vue'
import SocialIcon from './SocialIcon.vue'

const props = defineProps<{ open: boolean; person: Person }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const store = useKindyStore()
const draft = ref<PersonEdit>(fromPerson())
const birthDate = ref<PartialDate>()
const deathDate = ref<PartialDate>()
const syncToGoogle = ref(true)
const fileInput = ref<HTMLInputElement>()
const googlePhotoState = ref<'idle' | 'loading' | 'none'>('idle')

/** Linked contacts sync these fields; the form marks them with a cloud. */
const linked = computed(() => store.linkedToGoogle(props.person.id))
const syncActive = computed(() => linked.value && store.googleWriteBack)
const excluded = computed(() => new Set(props.person.syncExclusions ?? []))

const addressLabels = ['home', 'work', 'other'] as const
function addJob(): void {
  draft.value.jobs.push({ id: crypto.randomUUID() })
}

function fromPerson(): PersonEdit {
  const values = (kind: 'phone' | 'email' | 'address') =>
    props.person.contactPoints
      .filter((point) => point.kind === kind)
      .map((point) => ({ value: point.value, label: normalizeContactLabel(point.label) }))
  const detail = (definitionId: string) => {
    const value = props.person.details.find((item) => item.definitionId === definitionId)?.value
    return value === undefined ? undefined : String(value)
  }
  return {
    givenName: props.person.givenName ?? props.person.displayName,
    familyName: props.person.familyName,
    nickname: props.person.nickname,
    birthDate: props.person.birthDate,
    phones: values('phone'),
    emails: values('email'),
    addresses: values('address'),
    socials: props.person.contactPoints
      .filter((point) => point.kind === 'url')
      .map((point) =>
        isSocialPlatform(point.label)
          ? { platform: point.label, value: point.value }
          : { platform: 'other', label: point.label, value: point.value },
      ),
    jobs: jobsOf(props.person).map((job) => ({
      ...job,
      // A job read from the older details gets a real id when it is saved.
      id: job.id.startsWith('legacy-') ? crypto.randomUUID() : job.id,
    })),
    about: props.person.about,
    interests: detail('interests'),
    photoRef: props.person.photoRef,
    isDeceased: props.person.isDeceased,
    deathDate: props.person.deathDate,
    memorialNote: props.person.memorialNote,
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    draft.value = fromPerson()
    birthDate.value = props.person.birthDate ? { ...props.person.birthDate } : undefined
    deathDate.value = props.person.deathDate ? { ...props.person.deathDate } : undefined
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
      phones: draft.value.phones.map((entry) => ({ ...entry })),
      emails: draft.value.emails.map((entry) => ({ ...entry })),
      addresses: draft.value.addresses.map((entry) => ({ ...entry })),
      socials: draft.value.socials.map((social) => ({ ...social })),
      jobs: draft.value.jobs.map((job) => ({ ...job })),
      birthDate: birthDate.value ? { ...birthDate.value } : undefined,
      deathDate: draft.value.isDeceased && deathDate.value ? { ...deathDate.value } : undefined,
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
          <LabelledListInput
            v-model="draft.phones"
            :labels="phoneLabels"
            input-type="tel"
            :add-text="$t('edit.addPhone')"
          />
        </fieldset>

        <fieldset class="field picker-field">
          <legend class="field-label">
            {{ $t('edit.emails') }}
            <component :is="syncIcon('emails')" v-if="syncIcon('emails')" :size="14" />
          </legend>
          <LabelledListInput
            v-model="draft.emails"
            :labels="emailLabels"
            input-type="email"
            :add-text="$t('edit.addEmail')"
          />
        </fieldset>

        <fieldset class="field picker-field">
          <legend class="field-label">{{ $t('edit.addresses') }}</legend>
          <LabelledListInput
            v-model="draft.addresses"
            :labels="addressLabels"
            :add-text="$t('edit.addAddress')"
          />
        </fieldset>

        <fieldset class="field picker-field">
          <legend class="field-label">{{ $t('edit.work') }}</legend>
          <div v-for="(job, index) in draft.jobs" :key="job.id" class="job-entry">
            <div class="field-row">
              <label class="field">
                <span>{{ $t('details.occupation') }}</span>
                <input v-model="job.title" autocomplete="off" />
              </label>
              <label class="field">
                <span>{{ $t('details.employer') }}</span>
                <input v-model="job.employer" autocomplete="off" />
              </label>
            </div>
            <div class="field-row job-entry__dates">
              <label class="field">
                <span>{{ $t('edit.jobFrom') }}</span>
                <input v-model="job.startedOn" type="month" />
              </label>
              <label class="field">
                <span>{{ $t('edit.jobUntil') }}</span>
                <input v-model="job.endedOn" type="month" :placeholder="$t('edit.jobNow')" />
              </label>
              <button
                type="button"
                class="icon-button"
                :aria-label="$t('edit.removeJob')"
                @click="draft.jobs.splice(index, 1)"
              >
                <Trash2 :size="17" />
              </button>
            </div>
            <small v-if="!job.endedOn" class="field-hint">{{ $t('edit.jobCurrent') }}</small>
          </div>
          <button type="button" class="inline-action" @click="addJob">
            <Plus :size="16" /> {{ $t('edit.addJob') }}
          </button>
          <label class="field job-interests">
            <span>{{ $t('details.interests') }}</span>
            <textarea v-model="draft.interests" rows="2" />
          </label>
        </fieldset>

        <fieldset class="field picker-field">
          <legend class="field-label">{{ $t('edit.socials') }}</legend>
          <div
            v-for="(social, index) in draft.socials"
            :key="`social-${index}`"
            class="list-input list-input--labelled"
            :class="{ 'list-input--other': social.platform === 'other' }"
          >
            <span class="social-select">
              <SocialIcon :platform="social.platform" :size="18" />
              <select v-model="social.platform" :aria-label="$t('edit.platform')">
                <option v-for="platform in socialPlatforms" :key="platform" :value="platform">
                  {{ $t(`socials.${platform}`) }}
                </option>
                <option value="other">{{ $t('socials.other') }}</option>
              </select>
            </span>
            <input
              v-if="social.platform === 'other'"
              v-model="social.label"
              class="social-label"
              :placeholder="$t('edit.ownLabel')"
              autocomplete="off"
            />
            <input
              v-model="social.value"
              :placeholder="$t('edit.socialPlaceholder')"
              autocomplete="off"
              autocapitalize="off"
            />
            <button
              type="button"
              class="icon-button"
              :aria-label="$t('edit.remove')"
              @click="draft.socials.splice(index, 1)"
            >
              <X :size="18" />
            </button>
          </div>
          <button
            type="button"
            class="inline-action"
            @click="draft.socials.push({ platform: 'linkedin', value: '' })"
          >
            <Plus :size="16" /> {{ $t('edit.addSocial') }}
          </button>
          <small class="field-hint">{{ $t('edit.localOnlyHint') }}</small>
        </fieldset>

        <label class="field">
          <span>{{ $t('edit.about', { name: draft.givenName || person.displayName }) }}</span>
          <textarea v-model="draft.about" rows="4" :placeholder="$t('edit.aboutHint')" />
        </label>

        <fieldset v-if="!person.isSelf" class="field picker-field memorial-fields">
          <legend class="field-label">
            {{ $t('edit.memorial') }}
            <component :is="syncIcon('events')" v-if="syncIcon('events')" :size="14" />
          </legend>
          <label class="check-field">
            <input v-model="draft.isDeceased" type="checkbox" />
            <span>{{ $t('edit.isDeceased') }}</span>
          </label>
          <template v-if="draft.isDeceased">
            <span class="field-hint">{{ $t('edit.deathDate') }}</span>
            <PartialDateInput v-model="deathDate" />
            <label class="field memorial-note">
              <span>{{ $t('edit.memorialNote') }}</span>
              <textarea v-model="draft.memorialNote" rows="2" />
            </label>
          </template>
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
