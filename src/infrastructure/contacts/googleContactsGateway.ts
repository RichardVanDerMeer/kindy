import { Capacitor, registerPlugin } from '@capacitor/core'

import type { ContactUpdate, RemoteContactFields } from '@/domain/contactSync'
import type { ContactDate, ContactEvent } from '@/domain/model'
import type {
  ExternalContactsChangeSet,
  ExternalContactsConnection,
  ExternalContactsGateway,
  ExternalContactsPage,
  ExternalContactSnapshot,
  NewExternalContact,
} from '@/domain/ports'

interface GoogleContactsPlugin {
  authorize(options: { interactive: boolean }): Promise<ExternalContactsConnection>
  listConnections(options: {
    pageToken?: string
    syncToken?: string
  }): Promise<GoogleConnectionsResponse>
  getContact(options: { resourceName: string }): Promise<GoogleWritablePerson>
  updateContact(options: {
    resourceName: string
    updatePersonFields: string
    person: GoogleWritablePerson
  }): Promise<GoogleWritablePerson>
  createContact(options: { person: GoogleWritablePerson }): Promise<GoogleWritablePerson>
  findBackup(options: { name: string }): Promise<{ file?: GoogleDriveFile }>
  uploadBackup(options: {
    name: string
    fileId?: string
    content: string
  }): Promise<GoogleDriveFile>
  downloadBackup(options: { fileId: string }): Promise<{ content: string }>
  revoke(): Promise<void>
}

export interface GoogleDriveFile {
  id: string
  modifiedTime?: string
  size?: string
}

/** The subset of a People API person that Kindy reads back or writes. */
interface GoogleWritablePerson {
  resourceName?: string
  etag?: string
  names?: Array<{ givenName?: string; familyName?: string }>
  birthdays?: Array<{ date?: ContactDate }>
  events?: Array<{ type?: string; date?: ContactDate }>
  phoneNumbers?: Array<{ value: string }>
  emailAddresses?: Array<{ value: string }>
}

function remoteFields(person: GoogleWritablePerson): RemoteContactFields {
  return {
    birthdays: (person.birthdays ?? [])
      .map((birthday) => birthday.date)
      .filter((date): date is ContactDate => Boolean(date?.month && date.day)),
    events: (person.events ?? [])
      .filter((event): event is ContactEvent => Boolean(event.date?.month && event.date.day))
      .map((event) => ({ type: event.type ?? 'other', date: event.date })),
  }
}

function writablePerson(input: NewExternalContact): GoogleWritablePerson {
  return {
    names: [{ givenName: input.givenName, familyName: input.familyName }],
    birthdays: input.birthday ? [{ date: input.birthday }] : undefined,
    events: input.events.length ? input.events : undefined,
    phoneNumbers: input.phones.length ? input.phones.map((value) => ({ value })) : undefined,
    emailAddresses: input.emails.length ? input.emails.map((value) => ({ value })) : undefined,
  }
}

interface GoogleConnectionsResponse {
  connections?: GooglePerson[]
  nextPageToken?: string
  nextSyncToken?: string
  expiredSyncToken?: boolean
}

interface GooglePerson {
  resourceName?: string
  etag?: string
  metadata?: { deleted?: boolean }
  birthdays?: Array<{ date?: Partial<ContactDate>; metadata?: GoogleFieldMetadata }>
  events?: Array<{ type?: string; date?: Partial<ContactDate> }>
  names?: Array<{
    displayName?: string
    givenName?: string
    familyName?: string
    metadata?: GoogleFieldMetadata
  }>
  nicknames?: Array<{ value?: string; metadata?: GoogleFieldMetadata }>
  emailAddresses?: Array<{ value?: string; type?: string; metadata?: GoogleFieldMetadata }>
  phoneNumbers?: Array<{ value?: string; type?: string; metadata?: GoogleFieldMetadata }>
  addresses?: Array<{ formattedValue?: string; type?: string; metadata?: GoogleFieldMetadata }>
  urls?: Array<{ value?: string; type?: string; metadata?: GoogleFieldMetadata }>
  photos?: Array<{ url?: string; default?: boolean }>
}

interface GoogleFieldMetadata {
  primary?: boolean
  source?: { id?: string }
}

/** The one native Google plugin: it holds the account token for Contacts and Drive. */
export const nativeGooglePlugin = registerPlugin<GoogleContactsPlugin>('KindyGoogleContacts')
const nativePlugin = nativeGooglePlugin

function fieldId(metadata: GoogleFieldMetadata | undefined, fallback: string): string {
  return metadata?.source?.id ?? fallback
}

/** Google omits the year (or sends 0) for dates without one. */
function googleDate(date: Partial<ContactDate> | undefined): ContactDate | undefined {
  if (!date?.month || !date.day) return undefined
  return date.year
    ? { year: date.year, month: date.month, day: date.day }
    : { month: date.month, day: date.day }
}

/** The contact's own birthday wins over one copied from a Google profile. */
function googleBirthday(person: GooglePerson): ContactDate | undefined {
  const birthdays = person.birthdays ?? []
  const preferred =
    birthdays.find((birthday) => birthday.metadata?.primary && googleDate(birthday.date)) ??
    birthdays.find((birthday) => googleDate(birthday.date))
  return googleDate(preferred?.date)
}

export function mapGooglePerson(person: GooglePerson): ExternalContactSnapshot | null {
  const resourceName = person.resourceName
  const name = person.names?.find((candidate) => candidate.metadata?.primary) ?? person.names?.[0]
  if (!resourceName || !name?.displayName) return null

  const contactPoints: ExternalContactSnapshot['contactPoints'] = []
  person.phoneNumbers?.forEach((point, index) => {
    if (!point.value) return
    contactPoints.push({
      providerFieldId: fieldId(point.metadata, `phone-${index}`),
      kind: 'phone',
      label: point.type ?? 'phone',
      value: point.value,
    })
  })
  person.emailAddresses?.forEach((point, index) => {
    if (!point.value) return
    contactPoints.push({
      providerFieldId: fieldId(point.metadata, `email-${index}`),
      kind: 'email',
      label: point.type ?? 'email',
      value: point.value,
    })
  })
  person.addresses?.forEach((point, index) => {
    if (!point.formattedValue) return
    contactPoints.push({
      providerFieldId: fieldId(point.metadata, `address-${index}`),
      kind: 'address',
      label: point.type ?? 'address',
      value: point.formattedValue,
    })
  })
  person.urls?.forEach((point, index) => {
    if (!point.value) return
    contactPoints.push({
      providerFieldId: fieldId(point.metadata, `url-${index}`),
      kind: 'url',
      label: point.type ?? 'url',
      value: point.value,
    })
  })

  return {
    resourceName,
    etag: person.etag ?? '',
    birthday: googleBirthday(person),
    events: (person.events ?? []).flatMap((event) => {
      const date = googleDate(event.date)
      return date ? [{ type: event.type ?? 'other', date }] : []
    }),
    displayName: name.displayName,
    givenName: name.givenName,
    familyName: name.familyName,
    photoUrl: person.photos?.find((photo) => !photo.default)?.url,
    contactPoints,
  }
}

class NativeGoogleContactsGateway implements ExternalContactsGateway {
  private connection: ExternalContactsConnection | null = null

  async getConnection(): Promise<ExternalContactsConnection | null> {
    return this.connection
  }

  async authorize(): Promise<ExternalContactsConnection> {
    this.connection = await nativePlugin.authorize({ interactive: true })
    return this.connection
  }

  async restore(): Promise<ExternalContactsConnection | null> {
    if (this.connection) return this.connection
    try {
      this.connection = await nativePlugin.authorize({ interactive: false })
      return this.connection
    } catch {
      // Consent is missing or the device is offline; writes stay queued.
      return null
    }
  }

  async getContactFields(resourceName: string) {
    const person = await nativePlugin.getContact({ resourceName })
    return { etag: person.etag ?? '', ...remoteFields(person) }
  }

  async updateContactFields(resourceName: string, etag: string, update: ContactUpdate) {
    const person: GoogleWritablePerson = { etag }
    if (update.birthdays) person.birthdays = update.birthdays.map((date) => ({ date }))
    if (update.events) person.events = update.events
    const result = await nativePlugin.updateContact({
      resourceName,
      updatePersonFields: update.updatePersonFields.join(','),
      person,
    })
    return { etag: result.etag ?? '' }
  }

  async createContact(input: NewExternalContact) {
    const result = await nativePlugin.createContact({ person: writablePerson(input) })
    if (!result.resourceName) throw new Error('Google did not return the new contact')
    return { resourceName: result.resourceName, etag: result.etag ?? '' }
  }

  async listCandidates(pageToken?: string): Promise<ExternalContactsPage> {
    const response = await nativePlugin.listConnections({ pageToken })
    return {
      contacts: (response.connections ?? [])
        .map(mapGooglePerson)
        .filter((person): person is ExternalContactSnapshot => person !== null),
      nextPageToken: response.nextPageToken,
      nextSyncToken: response.nextSyncToken,
    }
  }

  async fetchChanges(syncToken: string): Promise<ExternalContactsChangeSet> {
    const response = await nativePlugin.listConnections({ syncToken })
    if (response.expiredSyncToken) {
      return {
        contacts: [],
        deletedResourceNames: [],
        nextSyncToken: '',
        requiresFullRefresh: true,
      }
    }
    const changed = response.connections ?? []
    return {
      contacts: changed
        .filter((person) => !person.metadata?.deleted)
        .map(mapGooglePerson)
        .filter((person): person is ExternalContactSnapshot => person !== null),
      deletedResourceNames: changed
        .filter((person) => person.metadata?.deleted && person.resourceName)
        .map((person) => person.resourceName as string),
      nextSyncToken: response.nextSyncToken ?? syncToken,
      requiresFullRefresh: false,
    }
  }

  async revoke(): Promise<void> {
    await nativePlugin.revoke()
    this.connection = null
  }
}

const previewContacts: ExternalContactSnapshot[] = [
  {
    resourceName: 'preview/google/lotte',
    etag: 'preview-1',
    displayName: 'Lotte de Jong',
    givenName: 'Lotte',
    familyName: 'de Jong',
    birthday: { year: 1991, month: 11, day: 8 },
    events: [],
    contactPoints: [
      {
        providerFieldId: 'preview-lotte-email',
        kind: 'email',
        label: 'privé',
        value: 'lotte@example.test',
      },
    ],
  },
  {
    resourceName: 'preview/google/mohammed',
    etag: 'preview-2',
    displayName: 'Mohammed El Amrani',
    givenName: 'Mohammed',
    familyName: 'El Amrani',
    birthday: { month: 10, day: 12 },
    events: [{ type: 'anniversary', date: { year: 2018, month: 7, day: 21 } }],
    contactPoints: [
      {
        providerFieldId: 'preview-mohammed-phone',
        kind: 'phone',
        label: 'mobiel',
        value: '+31 6 1234 5678',
      },
    ],
  },
  {
    resourceName: 'preview/google/noor',
    etag: 'preview-3',
    displayName: 'Noor Smit',
    givenName: 'Noor',
    familyName: 'Smit',
    events: [],
    contactPoints: [],
  },
]

const PREVIEW_STORE_KEY = 'kindy.preview-google-contacts'
const previewConnection: ExternalContactsConnection = {
  provider: 'google',
  providerAccountId: 'preview-account',
  displayName: 'Google-preview',
}

type PreviewStore = Record<string, GoogleWritablePerson>

function readPreviewStore(): PreviewStore {
  try {
    return JSON.parse(localStorage.getItem(PREVIEW_STORE_KEY) ?? '{}') as PreviewStore
  } catch {
    return {}
  }
}

function writePreviewStore(store: PreviewStore): void {
  try {
    localStorage.setItem(PREVIEW_STORE_KEY, JSON.stringify(store))
  } catch {
    // The preview address book is best effort only.
  }
}

/** Mimics network latency so the "waiting for Google" state is visible. */
function previewDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 600))
}

/**
 * Browser stand-in for Google Contacts. It behaves as an already linked
 * account and keeps written contacts in local storage, so the write-back flow
 * can be tried without a device.
 */
class PreviewGoogleContactsGateway implements ExternalContactsGateway {
  private connection: ExternalContactsConnection | null = null

  async getConnection(): Promise<ExternalContactsConnection | null> {
    return this.connection
  }

  async authorize(): Promise<ExternalContactsConnection> {
    this.connection = previewConnection
    return this.connection
  }

  async restore(): Promise<ExternalContactsConnection | null> {
    this.connection = previewConnection
    return this.connection
  }

  async getContactFields(resourceName: string) {
    await previewDelay()
    const person = readPreviewStore()[resourceName] ?? { etag: 'preview-0' }
    return { etag: person.etag ?? 'preview-0', ...remoteFields(person) }
  }

  async updateContactFields(resourceName: string, etag: string, update: ContactUpdate) {
    await previewDelay()
    const store = readPreviewStore()
    const person = store[resourceName] ?? {}
    if ((person.etag ?? 'preview-0') !== etag) throw new Error('The contact changed in Google')
    if (update.birthdays) person.birthdays = update.birthdays.map((date) => ({ date }))
    if (update.events) person.events = update.events
    person.etag = `preview-${Date.now()}`
    store[resourceName] = person
    writePreviewStore(store)
    return { etag: person.etag }
  }

  async createContact(input: NewExternalContact) {
    await previewDelay()
    const store = readPreviewStore()
    const resourceName = `people/preview-${crypto.randomUUID()}`
    const person = { ...writablePerson(input), resourceName, etag: `preview-${Date.now()}` }
    store[resourceName] = person
    writePreviewStore(store)
    return { resourceName, etag: person.etag }
  }

  async listCandidates(): Promise<ExternalContactsPage> {
    return { contacts: structuredClone(previewContacts), nextSyncToken: 'preview-sync' }
  }

  async fetchChanges(syncToken: string): Promise<ExternalContactsChangeSet> {
    return {
      contacts: [],
      deletedResourceNames: [],
      nextSyncToken: syncToken,
      requiresFullRefresh: false,
    }
  }

  async revoke(): Promise<void> {
    this.connection = null
  }
}

let gateway: ExternalContactsGateway | undefined

export function getGoogleContactsGateway(): ExternalContactsGateway {
  gateway ??= Capacitor.isNativePlatform()
    ? new NativeGoogleContactsGateway()
    : new PreviewGoogleContactsGateway()
  return gateway
}
