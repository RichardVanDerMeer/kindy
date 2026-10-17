<script setup lang="ts">
import { Check, ContactRound, LoaderCircle, Search, ShieldCheck, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import PersonAvatar from '@/components/PersonAvatar.vue'
import type { ExternalContactsConnection, ExternalContactSnapshot } from '@/domain/ports'
import { normalizeText } from '@/domain/duplicates'
import { getGoogleContactsGateway } from '@/infrastructure/contacts/googleContactsGateway'
import { useKindyStore } from '@/stores/kindy'

const props = defineProps<{ open: boolean; busy?: boolean }>()
const emit = defineEmits<{
  close: []
  import: [connection: ExternalContactsConnection, contacts: ExternalContactSnapshot[]]
}>()

const gateway = getGoogleContactsGateway()
const store = useKindyStore()
const step = ref<'intro' | 'loading' | 'select' | 'error'>('intro')
const connection = ref<ExternalContactsConnection | null>(null)
const contacts = ref<ExternalContactSnapshot[]>([])
const selected = ref(new Set<string>())
const query = ref('')
const error = ref('')

/** Contacts of this Google account that are already a person in Kindy. */
const linkedResourceNames = computed(() => {
  const accountId = connection.value?.providerAccountId
  return new Set(
    (store.data?.externalIdentities ?? [])
      .filter(
        (identity) =>
          identity.provider === 'google' &&
          identity.providerAccountId === accountId &&
          !identity.remoteDeletedAt,
      )
      .map((identity) => identity.providerResourceId),
  )
})

function inKindy(contact: ExternalContactSnapshot): boolean {
  return linkedResourceNames.value.has(contact.resourceName)
}

/** New contacts first, so the ones still to import are on top. */
const filteredContacts = computed(() => {
  const normalized = normalizeText(query.value)
  const matching = normalized
    ? contacts.value.filter((contact) => normalizeText(contact.displayName).includes(normalized))
    : contacts.value
  return [...matching.filter((contact) => !inKindy(contact)), ...matching.filter(inKindy)]
})

/** "Select everyone" applies to the new contacts the search shows. */
const selectable = computed(() => filteredContacts.value.filter((contact) => !inKindy(contact)))
const allSelected = computed(
  () =>
    selectable.value.length > 0 &&
    selectable.value.every((contact) => selected.value.has(contact.resourceName)),
)
const alreadyCount = computed(() => contacts.value.filter(inKindy).length)

function toggleAll(): void {
  const next = new Set(selected.value)
  for (const contact of selectable.value) {
    if (allSelected.value) next.delete(contact.resourceName)
    else next.add(contact.resourceName)
  }
  selected.value = next
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    step.value = 'intro'
    connection.value = null
    contacts.value = []
    selected.value = new Set()
    query.value = ''
    error.value = ''
  },
)

async function connect(): Promise<void> {
  step.value = 'loading'
  try {
    connection.value = await gateway.authorize()
    // Google returns the address book in pages of 100.
    const all: ExternalContactSnapshot[] = []
    let pageToken: string | undefined
    do {
      const page = await gateway.listCandidates(pageToken)
      all.push(...page.contacts)
      pageToken = page.nextPageToken
    } while (pageToken)
    contacts.value = all
    step.value = 'select'
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
    step.value = 'error'
  }
}

function toggle(resourceName: string): void {
  const next = new Set(selected.value)
  if (next.has(resourceName)) next.delete(resourceName)
  else next.add(resourceName)
  selected.value = next
}

function submit(): void {
  if (!connection.value || !selected.value.size) return
  emit(
    'import',
    connection.value,
    contacts.value.filter((contact) => selected.value.has(contact.resourceName)),
  )
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="$emit('close')">
      <section
        class="dialog contacts-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('google.title')"
      >
        <div class="dialog__handle" aria-hidden="true" />
        <header class="contacts-dialog__header">
          <span class="google-mark"><ContactRound :size="25" /></span>
          <span>
            <h2>{{ $t('google.title') }}</h2>
            <p>{{ $t('google.subtitle') }}</p>
          </span>
          <button class="icon-button" :aria-label="$t('people.cancel')" @click="$emit('close')">
            <X :size="22" />
          </button>
        </header>

        <div v-if="step === 'intro'" class="contacts-intro">
          <div class="privacy-callout">
            <ShieldCheck :size="24" />
            <p>{{ $t('google.privacy') }}</p>
          </div>
          <button class="button button--primary settings-wide-button" @click="connect">
            {{ $t('google.continue') }}
          </button>
        </div>

        <div v-else-if="step === 'loading'" class="contacts-loading" role="status">
          <LoaderCircle class="spin-icon" :size="30" />
          <p>{{ $t('google.loading') }}</p>
        </div>

        <div v-else-if="step === 'error'" class="contacts-loading" role="alert">
          <p>{{ error }}</p>
          <button class="button button--ghost" @click="step = 'intro'">
            {{ $t('common.retry') }}
          </button>
        </div>

        <template v-else>
          <label class="search-field contacts-search">
            <Search :size="20" />
            <input v-model="query" type="search" :placeholder="$t('google.search')" />
          </label>
          <div class="contact-picker-toolbar">
            <small>{{ $t('google.alreadyCount', { count: alreadyCount }, alreadyCount) }}</small>
            <button v-if="selectable.length" type="button" class="section-link" @click="toggleAll">
              {{ allSelected ? $t('google.selectNone') : $t('google.selectAll') }}
            </button>
          </div>
          <div class="contact-picker-list">
            <template v-for="contact in filteredContacts" :key="contact.resourceName">
              <div v-if="inKindy(contact)" class="contact-picker-row contact-picker-row--linked">
                <PersonAvatar :name="contact.displayName" size="small" />
                <span>
                  <strong>{{ contact.displayName }}</strong>
                  <small>{{ contact.contactPoints[0]?.value || $t('google.noDetails') }}</small>
                </span>
                <span class="contact-picker-tag">{{ $t('google.inKindy') }}</span>
              </div>
              <button
                v-else
                class="contact-picker-row"
                :class="{ 'contact-picker-row--selected': selected.has(contact.resourceName) }"
                :aria-pressed="selected.has(contact.resourceName)"
                @click="toggle(contact.resourceName)"
              >
                <PersonAvatar :name="contact.displayName" size="small" />
                <span>
                  <strong>{{ contact.displayName }}</strong>
                  <small>{{ contact.contactPoints[0]?.value || $t('google.noDetails') }}</small>
                </span>
                <span class="selection-check"><Check :size="17" /></span>
              </button>
            </template>
          </div>
          <button
            class="button button--primary settings-wide-button"
            :disabled="!selected.size || busy"
            :aria-busy="busy || undefined"
            @click="submit"
          >
            {{ $t('google.importSelected', { count: selected.size }) }}
          </button>
        </template>
      </section>
    </div>
  </Teleport>
</template>
