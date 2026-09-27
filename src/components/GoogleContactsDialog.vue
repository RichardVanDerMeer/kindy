<script setup lang="ts">
import { Check, ContactRound, LoaderCircle, Search, ShieldCheck, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import PersonAvatar from '@/components/PersonAvatar.vue'
import type { ExternalContactsConnection, ExternalContactSnapshot } from '@/domain/ports'
import { normalizeText } from '@/domain/duplicates'
import { getGoogleContactsGateway } from '@/infrastructure/contacts/googleContactsGateway'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  close: []
  import: [connection: ExternalContactsConnection, contacts: ExternalContactSnapshot[]]
}>()

const gateway = getGoogleContactsGateway()
const step = ref<'intro' | 'loading' | 'select' | 'error'>('intro')
const connection = ref<ExternalContactsConnection | null>(null)
const contacts = ref<ExternalContactSnapshot[]>([])
const selected = ref(new Set<string>())
const query = ref('')
const error = ref('')

const filteredContacts = computed(() => {
  const normalized = normalizeText(query.value)
  if (!normalized) return contacts.value
  return contacts.value.filter((contact) => normalizeText(contact.displayName).includes(normalized))
})

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
    const page = await gateway.listCandidates()
    contacts.value = page.contacts
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
          <ul class="privacy-list privacy-list--dialog">
            <li>{{ $t('settings.googleReadOnly') }}</li>
            <li>{{ $t('settings.googleChoose') }}</li>
            <li>{{ $t('settings.googleLocalCopy') }}</li>
          </ul>
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
          <div class="contact-picker-list">
            <button
              v-for="contact in filteredContacts"
              :key="contact.resourceName"
              class="contact-picker-row"
              :class="{ 'contact-picker-row--selected': selected.has(contact.resourceName) }"
              @click="toggle(contact.resourceName)"
            >
              <PersonAvatar :name="contact.displayName" size="small" />
              <span>
                <strong>{{ contact.displayName }}</strong>
                <small>{{ contact.contactPoints[0]?.value || $t('google.noDetails') }}</small>
              </span>
              <span class="selection-check"><Check :size="17" /></span>
            </button>
          </div>
          <button
            class="button button--primary settings-wide-button"
            :disabled="!selected.size"
            @click="submit"
          >
            {{ $t('google.importSelected', { count: selected.size }) }}
          </button>
        </template>
      </section>
    </div>
  </Teleport>
</template>
