import { Capacitor, registerPlugin } from '@capacitor/core'

import type {
  ExternalContactsChangeSet,
  ExternalContactsConnection,
  ExternalContactsGateway,
  ExternalContactsPage,
  ExternalContactSnapshot,
} from '@/domain/ports'

interface GoogleContactsPlugin {
  authorize(options: { interactive: boolean }): Promise<ExternalContactsConnection>
  listConnections(options: {
    pageToken?: string
    syncToken?: string
  }): Promise<GoogleConnectionsResponse>
  revoke(): Promise<void>
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

const nativePlugin = registerPlugin<GoogleContactsPlugin>('KindyGoogleContacts')

function fieldId(metadata: GoogleFieldMetadata | undefined, fallback: string): string {
  return metadata?.source?.id ?? fallback
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
    contactPoints: [],
  },
]

class PreviewGoogleContactsGateway implements ExternalContactsGateway {
  private connection: ExternalContactsConnection | null = null

  async getConnection(): Promise<ExternalContactsConnection | null> {
    return this.connection
  }

  async authorize(): Promise<ExternalContactsConnection> {
    this.connection = {
      provider: 'google',
      providerAccountId: 'preview-account',
      displayName: 'Google-preview',
    }
    return this.connection
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
