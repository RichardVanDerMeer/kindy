import { describe, expect, it } from 'vitest'

import { applyRemoteContact } from '@/domain/incomingContacts'

import {
  allSyncFields,
  enqueueSync,
  fieldsToWrite,
  importedContactDates,
  managedContactFields,
  planContactUpdate,
  type ContactUpdate,
  type RemoteContactFields,
} from '@/domain/contactSync'
import type { ExternalIdentity, KindyData, Person } from '@/domain/model'
import type {
  ExternalContactsChangeSet,
  ExternalContactsGateway,
  ExternalContactsPage,
  ExternalContactSnapshot,
  NewExternalContact,
} from '@/domain/ports'
import { runIncomingContactSync } from '@/infrastructure/sync/contactChangesRunner'
import { runContactSync } from '@/infrastructure/sync/contactSyncRunner'

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    displayName: id,
    givenName: id,
    isFavorite: false,
    isArchived: false,
    isDeceased: false,
    contactPoints: [],
    details: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function data(overrides: Partial<KindyData>): KindyData {
  return {
    schemaVersion: 6,
    people: [],
    externalIdentities: [],
    circles: [],
    memberships: [],
    relationships: [],
    notes: [],
    events: [],
    reminders: [],
    reminderOccurrences: [],
    interactions: [],
    syncQueue: [],
    wishes: [],
    calendarLinks: [],
    ...overrides,
  }
}

const labels = { death: 'Overleden' }

describe('managed contact fields', () => {
  it('maps birthday, wedding day and death, and keeps unknown years out', () => {
    const fields = managedContactFields(
      'henk',
      data({
        people: [
          person('henk', {
            isDeceased: true,
            birthDate: { year: null, month: 2, day: 3 },
            deathDate: { year: 2024, month: 5, day: 14 },
          }),
        ],
        events: [
          {
            id: 'wedding',
            type: 'wedding-anniversary',
            title: 'Trouwdag',
            date: { year: 1975, month: 6, day: 12 },
            personIds: ['henk', 'els'],
            source: 'kindy',
          },
        ],
      }),
      labels,
    )
    expect(fields).toMatchObject({
      birthday: { month: 2, day: 3 },
      events: [
        { type: 'anniversary', date: { year: 1975, month: 6, day: 12 } },
        { type: 'Overleden', date: { year: 2024, month: 5, day: 14 } },
      ],
    })
  })
})

describe('planning a contact update', () => {
  const nameDay = { type: 'Naamdag', date: { month: 4, day: 11 } }

  it('keeps events Kindy did not write and replaces its own earlier values', () => {
    const plan = planContactUpdate(
      {
        birthdays: [],
        events: [nameDay, { type: 'anniversary', date: { year: 2010, month: 6, day: 1 } }],
      },
      { birthday: null, events: [{ type: 'anniversary', date: { year: 2010, month: 6, day: 1 } }] },
      { birthday: null, events: [{ type: 'anniversary', date: { year: 2011, month: 6, day: 1 } }] },
      ['events'],
    )
    expect(plan).toEqual({
      updatePersonFields: ['events'],
      events: [nameDay, { type: 'anniversary', date: { year: 2011, month: 6, day: 1 } }],
    })
  })

  it('only touches the birthday when that is all that changed', () => {
    const plan = planContactUpdate(
      { birthdays: [], events: [nameDay] },
      undefined,
      { birthday: { year: 1990, month: 10, day: 3 }, events: [] },
      allSyncFields,
    )
    expect(plan).toEqual({
      updatePersonFields: ['birthdays'],
      birthdays: [{ year: 1990, month: 10, day: 3 }],
    })
  })

  it('keeps numbers added in Google and their labels, and removes numbers Kindy removed', () => {
    const plan = planContactUpdate(
      {
        birthdays: [],
        events: [],
        phones: [
          { value: '+31 6 1111 1111', type: 'mobile' },
          { value: '+31 20 222 2222', type: 'work' },
        ],
      },
      { birthday: null, events: [], phones: ['+31611111111', '+31 20 222 2222'] },
      { birthday: null, events: [], phones: ['+31611111111', '+31 6 3333 3333'] },
      ['phones'],
    )
    expect(plan).toEqual({
      updatePersonFields: ['phoneNumbers'],
      phoneNumbers: [{ value: '+31 6 1111 1111', type: 'mobile' }, { value: '+31 6 3333 3333' }],
    })
  })

  it('leaves fields that are kept in Kindy only untouched', () => {
    const fields = fieldsToWrite({ kind: 'update', fields: ['name', 'birthday'] }, [
      'name',
      'birthday',
    ])
    const plan = planContactUpdate(
      { birthdays: [], events: [], name: { givenName: 'Robin' } },
      undefined,
      { birthday: { month: 1, day: 1 }, events: [], name: { givenName: 'Rob' } },
      fields,
    )
    expect(fields).toEqual([])
    expect(plan).toBeNull()
  })

  it('only writes the fields the user changed', () => {
    // The name differs from Google (renamed there), but only the birthday was changed in Kindy.
    const plan = planContactUpdate(
      { birthdays: [], events: [], name: { givenName: 'Robert' }, phones: [{ value: '1' }] },
      { birthday: null, events: [], phones: ['1'] },
      { birthday: { month: 5, day: 4 }, events: [], name: { givenName: 'Robin' }, phones: [] },
      ['birthday'],
    )
    expect(plan?.updatePersonFields).toEqual(['birthdays'])
  })

  it('keeps middle names and prefixes when the name is updated', () => {
    const plan = planContactUpdate(
      {
        birthdays: [],
        events: [],
        name: { givenName: 'Jan', familyName: 'Berg', preserved: { middleName: 'van den' } },
      },
      undefined,
      { birthday: null, events: [], name: { givenName: 'Johan', familyName: 'Berg' } },
      ['name'],
    )
    expect(plan?.names).toEqual([
      { preserved: { middleName: 'van den' }, givenName: 'Johan', familyName: 'Berg' },
    ])
  })

  it('does nothing when Google already matches', () => {
    const current = { birthday: { month: 1, day: 2 }, events: [] }
    expect(
      planContactUpdate(
        { birthdays: [{ month: 1, day: 2 }], events: [] },
        current,
        current,
        allSyncFields,
      ),
    ).toBeNull()
  })
})

describe('sync queue', () => {
  it('keeps one operation per person and skips updates while a create is pending', () => {
    let id = 0
    const next = () => `op-${++id}`
    let queue = enqueueSync([], 'robin', 'update', 1, next)
    queue = enqueueSync(queue, 'robin', 'update', 2, next)
    expect(queue).toHaveLength(1)
    expect(queue[0]?.updatedAt).toBe(2)

    queue = enqueueSync(queue, 'lotte', 'create', 3, next)
    expect(enqueueSync(queue, 'lotte', 'update', 4, next)).toBe(queue)
  })
})

class FakeGoogle implements ExternalContactsGateway {
  contacts = new Map<string, RemoteContactFields & { etag: string }>()
  updates: Array<{ resourceName: string; update: ContactUpdate }> = []
  created: NewExternalContact[] = []
  connected = true

  useAccount() {}
  async getConnection() {
    return null
  }
  async authorize() {
    return { provider: 'google' as const, providerAccountId: 'account' }
  }
  async restore() {
    return this.connected ? this.authorize() : null
  }
  async listCandidates(_pageToken?: string): Promise<ExternalContactsPage> {
    return { contacts: [] }
  }
  async fetchChanges(syncToken: string, _pageToken?: string): Promise<ExternalContactsChangeSet> {
    return {
      contacts: [],
      deletedResourceNames: [],
      nextSyncToken: syncToken,
      requiresFullRefresh: false,
    }
  }
  async getContactFields(resourceName: string) {
    return this.contacts.get(resourceName) ?? { etag: 'e0', birthdays: [], events: [] }
  }
  async updateContactFields(resourceName: string, _etag: string, update: ContactUpdate) {
    this.updates.push({ resourceName, update })
    return { etag: 'e1' }
  }
  async createContact(input: NewExternalContact) {
    this.created.push(input)
    return { resourceName: 'people/new', etag: 'e1' }
  }
  photos: string[] = []
  async updateContactPhoto(_resourceName: string, photo: string) {
    this.photos.push(photo)
    return { etag: 'e2' }
  }
  async revoke() {}
}

function memoryRepository(initial: KindyData) {
  let stored = structuredClone(initial)
  return {
    async getData() {
      return structuredClone(stored)
    },
    async replaceData(next: KindyData) {
      stored = structuredClone(next)
    },
    get current() {
      return stored
    },
  }
}

const identity: ExternalIdentity = {
  id: 'identity-robin',
  personId: 'robin',
  provider: 'google',
  providerAccountId: 'account',
  providerResourceId: 'people/robin',
}

describe('running the sync', () => {
  it('writes a changed birthday and records what was written', async () => {
    const google = new FakeGoogle()
    google.contacts.set('people/robin', {
      etag: 'e0',
      birthdays: [],
      events: [],
      name: { givenName: 'robin' },
    })
    const repository = memoryRepository(
      data({
        people: [person('robin', { birthDate: { year: 1985, month: 10, day: 2 } })],
        externalIdentities: [identity],
        syncQueue: [
          {
            id: 'op',
            personId: 'robin',
            kind: 'update',
            state: 'pending',
            attempts: 0,
            updatedAt: 1,
          },
        ],
      }),
    )

    const result = await runContactSync({ repository, gateway: google, labels, now: () => 5 })

    expect(result).toEqual({ done: 1, failed: 0, waiting: false })
    expect(google.updates[0]?.update.updatePersonFields).toEqual(['birthdays'])
    expect(repository.current.syncQueue).toEqual([])
    expect(repository.current.externalIdentities[0]).toMatchObject({
      etag: 'e1',
      lastSyncedAt: 5,
      writtenFields: { birthday: { year: 1985, month: 10, day: 2 }, events: [] },
    })
  })

  it('uploads a photo chosen in Kindy once, and skips fields kept in Kindy only', async () => {
    const google = new FakeGoogle()
    google.contacts.set('people/robin', {
      etag: 'e0',
      birthdays: [],
      events: [],
      name: { givenName: 'Robin' },
    })
    const repository = memoryRepository(
      data({
        people: [
          person('robin', {
            givenName: 'Rob',
            photoRef: 'data:image/jpeg;base64,AAAA',
            syncExclusions: ['name'],
          }),
        ],
        externalIdentities: [identity],
        syncQueue: [
          {
            id: 'op',
            personId: 'robin',
            kind: 'update',
            fields: ['name', 'photo'],
            state: 'pending',
            attempts: 0,
            updatedAt: 1,
          },
        ],
      }),
    )

    await runContactSync({ repository, gateway: google, labels })

    expect(google.updates).toEqual([])
    expect(google.photos).toEqual(['data:image/jpeg;base64,AAAA'])
    expect(repository.current.externalIdentities[0]?.writtenFields?.name).toBeUndefined()
    expect(repository.current.externalIdentities[0]?.writtenFields?.photoHash).toBeTruthy()
  })

  it('creates a Google contact for a new person and links it', async () => {
    const google = new FakeGoogle()
    const repository = memoryRepository(
      data({
        people: [person('lotte', { givenName: 'Lotte', familyName: 'Bakker' })],
        syncQueue: [
          {
            id: 'op',
            personId: 'lotte',
            kind: 'create',
            state: 'pending',
            attempts: 0,
            updatedAt: 1,
          },
        ],
      }),
    )

    await runContactSync({ repository, gateway: google, labels, newId: () => 'identity-new' })

    expect(google.created[0]).toMatchObject({ givenName: 'Lotte', familyName: 'Bakker' })
    expect(repository.current.externalIdentities).toEqual([
      expect.objectContaining({
        id: 'identity-new',
        personId: 'lotte',
        providerResourceId: 'people/new',
      }),
    ])
  })

  it('keeps work queued without a connection and marks failures for retry', async () => {
    const google = new FakeGoogle()
    const queued = data({
      people: [person('robin', { birthDate: { year: null, month: 1, day: 1 } })],
      externalIdentities: [identity],
      syncQueue: [
        {
          id: 'op',
          personId: 'robin',
          kind: 'update',
          state: 'pending',
          attempts: 0,
          updatedAt: 1,
        },
      ],
    })

    google.connected = false
    const offline = memoryRepository(queued)
    expect(await runContactSync({ repository: offline, gateway: google, labels })).toMatchObject({
      waiting: true,
    })
    expect(offline.current.syncQueue).toHaveLength(1)

    google.connected = true
    google.updateContactFields = async () => {
      throw new Error('Google Contacts returned HTTP 503')
    }
    const failing = memoryRepository(queued)
    await runContactSync({ repository: failing, gateway: google, labels })
    expect(failing.current.syncQueue[0]).toMatchObject({
      state: 'failed',
      attempts: 1,
      lastError: 'Google Contacts returned HTTP 503',
    })
  })
})

describe('account safety', () => {
  it('never writes a contact that belongs to another Google account', async () => {
    const google = new FakeGoogle()
    const repository = memoryRepository(
      data({
        people: [person('robin', { birthDate: { year: null, month: 1, day: 1 } })],
        externalIdentities: [{ ...identity, providerAccountId: 'someone-else' }],
        syncQueue: [
          {
            id: 'op',
            personId: 'robin',
            kind: 'update',
            fields: ['birthday'],
            state: 'pending',
            attempts: 0,
            updatedAt: 1,
          },
        ],
      }),
    )

    await runContactSync({ repository, gateway: google, labels })

    expect(google.updates).toEqual([])
    expect(repository.current.syncQueue[0]).toMatchObject({
      state: 'failed',
      lastError: 'Linked to another Google account',
    })
  })

  // The native bridge itself is checked in google-safety.spec.ts (ADR 0005, section 5).
  it('offers no way to delete a Google contact', () => {
    expect(Object.getOwnPropertyNames(FakeGoogle.prototype).join()).not.toMatch(/delete/i)
  })
})

describe('importing dates from Google', () => {
  it('reads birthday, anniversaries and a death event in any supported language', () => {
    expect(
      importedContactDates(
        { month: 3, day: 1 },
        [
          { type: 'anniversary', date: { year: 1999, month: 5, day: 20 } },
          { type: 'Passed away', date: { year: 2023, month: 8, day: 2 } },
          { type: 'Naamdag', date: { month: 4, day: 11 } },
        ],
        ['Overleden', 'Passed away'],
      ),
    ).toEqual({
      birthDate: { year: null, month: 3, day: 1 },
      deathDate: { year: 2023, month: 8, day: 2 },
      anniversaries: [{ year: 1999, month: 5, day: 20 }],
    })
  })
})

/** Google with an address book that can be read in pages and as change sets. */
class ChangingGoogle extends FakeGoogle {
  pages: ExternalContactsPage[] = [{ contacts: [], nextSyncToken: 'full-token' }]
  changes: ExternalContactsChangeSet[] = []
  fullReads = 0
  changeRequests: Array<{ syncToken: string; pageToken?: string }> = []

  override async listCandidates(pageToken?: string) {
    if (!pageToken) this.fullReads += 1
    const index = pageToken ? Number(pageToken) : 0
    return this.pages[index] ?? { contacts: [] }
  }

  override async fetchChanges(syncToken: string, pageToken?: string) {
    this.changeRequests.push({ syncToken, pageToken })
    const index = pageToken ? Number(pageToken) : 0
    return (
      this.changes[index] ?? {
        contacts: [],
        deletedResourceNames: [],
        nextSyncToken: syncToken,
        requiresFullRefresh: false,
      }
    )
  }
}

function tokenStore(initial: Record<string, string> = {}) {
  const tokens = new Map(Object.entries(initial))
  return {
    tokens,
    get: (account: string) => tokens.get(account),
    set: (account: string, token: string | undefined) => {
      if (token) tokens.set(account, token)
      else tokens.delete(account)
    },
  }
}

function snapshot(overrides: Partial<ExternalContactSnapshot> = {}): ExternalContactSnapshot {
  return {
    resourceName: 'people/robin',
    etag: 'e5',
    displayName: 'Robin Visser',
    givenName: 'Robin',
    familyName: 'Visser',
    events: [],
    contactPoints: [],
    ...overrides,
  }
}

const incomingLabels = { death: 'Overleden', deathLabels: ['Overleden', 'Passed away'] }

function changeSet(overrides: Partial<ExternalContactsChangeSet>): ExternalContactsChangeSet {
  return {
    contacts: [],
    deletedResourceNames: [],
    nextSyncToken: 'token-2',
    requiresFullRefresh: false,
    ...overrides,
  }
}

function linkedRobin(overrides: Partial<KindyData> = {}) {
  return data({
    people: [
      person('robin', {
        displayName: 'Robin',
        givenName: 'Robin',
        birthDate: { year: null, month: 1, day: 1 },
        contactPoints: [
          {
            id: 'phone-old',
            kind: 'phone',
            label: 'mobile',
            value: '+31 6 0000 0000',
            normalizedValue: '+31600000000',
            isPrimary: true,
            source: 'google',
          },
          {
            id: 'address-kindy',
            kind: 'address',
            label: 'home',
            value: 'Dorpsstraat 1',
            normalizedValue: 'dorpsstraat 1',
            isPrimary: true,
            source: 'kindy',
          },
        ],
      }),
      person('lotte'),
    ],
    externalIdentities: [
      { ...identity, etag: 'e0', writtenFields: { birthday: { month: 1, day: 1 }, events: [] } },
    ],
    circles: [
      {
        id: 'family',
        name: 'Familie',
        colorToken: 'family',
        iconKey: 'home',
        isFavorite: false,
        isArchived: false,
      },
    ],
    ...overrides,
  })
}

describe('reading changes from Google', () => {
  it('replaces the Google fields of a linked person and keeps the new sync token', async () => {
    const google = new ChangingGoogle()
    google.changes = [
      changeSet({
        contacts: [
          snapshot({
            birthday: { year: 1985, month: 10, day: 2 },
            events: [{ type: 'anniversary', date: { year: 2012, month: 6, day: 9 } }],
            contactPoints: [
              { providerFieldId: 'p1', kind: 'phone', label: 'work', value: '+31 20 123 4567' },
              { providerFieldId: 'm1', kind: 'email', label: 'home', value: 'robin@example.test' },
              { providerFieldId: 'a1', kind: 'address', label: 'work', value: 'Kade 2' },
              { providerFieldId: 'u1', kind: 'url', label: 'website', value: 'https://robin.test' },
            ],
          }),
          snapshot({ resourceName: 'people/stranger', displayName: 'Not linked' }),
        ],
      }),
    ]
    const repository = memoryRepository(linkedRobin())
    const syncTokens = tokenStore({ account: 'token-1' })

    const result = await runIncomingContactSync({
      repository,
      gateway: google,
      syncTokens,
      labels: incomingLabels,
      now: () => 9,
      newId: (() => {
        let id = 0
        return () => `new-${++id}`
      })(),
    })

    expect(result).toEqual({ updated: 1, removed: 0, fullRead: false, waiting: false })
    expect(google.changeRequests).toEqual([{ syncToken: 'token-1', pageToken: undefined }])
    expect(syncTokens.tokens.get('account')).toBe('token-2')
    const robin = repository.current.people.find((candidate) => candidate.id === 'robin')
    expect(robin).toMatchObject({
      displayName: 'Robin Visser',
      familyName: 'Visser',
      birthDate: { year: 1985, month: 10, day: 2 },
      updatedAt: 9,
    })
    expect(robin?.contactPoints.map((point) => [point.kind, point.value])).toEqual([
      ['phone', '+31 20 123 4567'],
      ['email', 'robin@example.test'],
      ['address', 'Kade 2'],
      // Kindy does not write addresses yet, so one added in Kindy stays.
      ['address', 'Dorpsstraat 1'],
      ['url', 'https://robin.test'],
    ])
    expect(repository.current.events).toEqual([
      expect.objectContaining({
        type: 'anniversary',
        date: { year: 2012, month: 6, day: 9 },
        personIds: ['robin'],
        source: 'google',
        externalSourceRef: 'people/robin',
      }),
    ])
    // Unlinked contacts are not imported; Kindy data is untouched.
    expect(repository.current.people).toHaveLength(2)
    expect(repository.current.circles).toHaveLength(1)
    expect(repository.current.externalIdentities[0]).toMatchObject({
      etag: 'e5',
      lastSyncedAt: 9,
      writtenFields: { birthday: { year: 1985, month: 10, day: 2 } },
    })
  })

  it('follows change pages and only stores the token of the last page', async () => {
    const google = new ChangingGoogle()
    google.changes = [
      changeSet({ contacts: [snapshot({ displayName: 'Robin 1' })], nextPageToken: '1' }),
      changeSet({ contacts: [snapshot({ displayName: 'Robin 2', etag: 'e6' })] }),
    ]
    const repository = memoryRepository(linkedRobin())
    const syncTokens = tokenStore({ account: 'token-1' })

    await runIncomingContactSync({
      repository,
      gateway: google,
      syncTokens,
      labels: incomingLabels,
    })

    expect(google.changeRequests).toEqual([
      { syncToken: 'token-1', pageToken: undefined },
      { syncToken: 'token-1', pageToken: '1' },
    ])
    expect(repository.current.people[0]?.displayName).toBe('Robin 2')
    expect(syncTokens.tokens.get('account')).toBe('token-2')
  })

  it('skips a contact whose etag Kindy already has', async () => {
    const google = new ChangingGoogle()
    google.changes = [changeSet({ contacts: [snapshot({ etag: 'e0' })] })]
    const repository = memoryRepository(linkedRobin())

    const result = await runIncomingContactSync({
      repository,
      gateway: google,
      syncTokens: tokenStore({ account: 'token-1' }),
      labels: incomingLabels,
    })

    expect(result.updated).toBe(0)
    expect(repository.current.people[0]?.displayName).toBe('Robin')
  })

  it('keeps edits that still wait in the sync queue', async () => {
    const google = new ChangingGoogle()
    google.changes = [
      changeSet({ contacts: [snapshot({ birthday: { year: 1990, month: 3, day: 3 } })] }),
    ]
    const repository = memoryRepository(
      linkedRobin({
        syncQueue: [
          {
            id: 'op',
            personId: 'robin',
            kind: 'update',
            fields: ['birthday'],
            state: 'failed',
            attempts: 1,
            updatedAt: 1,
          },
        ],
      }),
    )

    await runIncomingContactSync({
      repository,
      gateway: google,
      syncTokens: tokenStore({ account: 'token-1' }),
      labels: incomingLabels,
    })

    const robin = repository.current.people[0]
    expect(robin?.displayName).toBe('Robin Visser')
    expect(robin?.birthDate).toEqual({ year: null, month: 1, day: 1 })
    expect(repository.current.syncQueue).toHaveLength(1)
  })

  it('reads a death and does not add a wedding day kept in Kindy a second time', async () => {
    const google = new ChangingGoogle()
    google.changes = [
      changeSet({
        contacts: [
          snapshot({
            events: [
              { type: 'anniversary', date: { year: 1975, month: 6, day: 12 } },
              { type: 'Passed away', date: { year: 2024, month: 5, day: 14 } },
            ],
          }),
        ],
      }),
    ]
    const wedding = {
      id: 'wedding',
      type: 'wedding-anniversary' as const,
      title: 'Trouwdag',
      date: { year: 1975, month: 6, day: 12 },
      personIds: ['robin', 'lotte'],
      source: 'kindy' as const,
    }
    const repository = memoryRepository(linkedRobin({ events: [wedding] }))

    await runIncomingContactSync({
      repository,
      gateway: google,
      syncTokens: tokenStore({ account: 'token-1' }),
      labels: incomingLabels,
    })

    expect(repository.current.events).toEqual([wedding])
    expect(repository.current.people[0]).toMatchObject({
      isDeceased: true,
      deathDate: { year: 2024, month: 5, day: 14 },
    })
  })

  it('hides a person deleted in Google and shows them again after an undo', async () => {
    const google = new ChangingGoogle()
    google.changes = [changeSet({ deletedResourceNames: ['people/robin', 'people/unknown'] })]
    const repository = memoryRepository(linkedRobin())
    const syncTokens = tokenStore({ account: 'token-1' })

    const removed = await runIncomingContactSync({
      repository,
      gateway: google,
      syncTokens,
      labels: incomingLabels,
      now: () => 20,
    })

    expect(removed).toMatchObject({ removed: 1 })
    expect(repository.current.externalIdentities[0]?.remoteDeletedAt).toBe(20)
    expect(repository.current.people[0]).toMatchObject({ id: 'robin', deletedAt: 20 })
    expect(repository.current.circles).toHaveLength(1)

    google.changes = [changeSet({ contacts: [snapshot()], nextSyncToken: 'token-3' })]
    await runIncomingContactSync({
      repository,
      gateway: google,
      syncTokens,
      labels: incomingLabels,
      now: () => 30,
    })

    expect(repository.current.externalIdentities[0]?.remoteDeletedAt).toBeUndefined()
    expect(repository.current.people[0]?.deletedAt).toBeUndefined()
    expect(syncTokens.tokens.get('account')).toBe('token-3')
  })

  it('reads all contacts when the token expired and hides linked ones that are gone', async () => {
    const google = new ChangingGoogle()
    google.changes = [changeSet({ requiresFullRefresh: true, nextSyncToken: '' })]
    // Robin is gone; a contact the listing leaves out (no name) still exists.
    google.getContactFields = async (resourceName: string) => {
      if (resourceName === 'people/robin')
        throw Object.assign(new Error('HTTP 404'), { code: '404' })
      return { etag: 'n1', birthdays: [], events: [] }
    }
    google.pages = [
      { contacts: [snapshot({ resourceName: 'people/other' })], nextPageToken: '1' },
      { contacts: [snapshot({ resourceName: 'people/lotte', etag: 'l2' })], nextSyncToken: 'full' },
    ]
    const repository = memoryRepository(
      linkedRobin({
        externalIdentities: [
          { ...identity, etag: 'e0' },
          {
            ...identity,
            id: 'identity-lotte',
            personId: 'lotte',
            providerResourceId: 'people/lotte',
          },
          {
            ...identity,
            id: 'identity-nameless',
            personId: 'nameless',
            providerResourceId: 'people/nameless',
          },
          // Another account's contacts are not in this address book.
          {
            ...identity,
            id: 'identity-x',
            providerAccountId: 'other',
            providerResourceId: 'people/x',
          },
        ],
      }),
    )
    const syncTokens = tokenStore({ account: 'expired' })

    const result = await runIncomingContactSync({
      repository,
      gateway: google,
      syncTokens,
      labels: incomingLabels,
      now: () => 40,
    })

    expect(result).toEqual({ updated: 1, removed: 1, fullRead: true, waiting: false })
    expect(google.fullReads).toBe(1)
    expect(syncTokens.tokens.get('account')).toBe('full')
    const [robin, lotte, nameless, other] = repository.current.externalIdentities
    expect(robin?.remoteDeletedAt).toBe(40)
    expect(nameless?.remoteDeletedAt).toBeUndefined()
    expect(lotte?.etag).toBe('l2')
    expect(lotte?.remoteDeletedAt).toBeUndefined()
    expect(other?.remoteDeletedAt).toBeUndefined()
  })

  it('reads all contacts on the first run, and does nothing without a link or connection', async () => {
    const google = new ChangingGoogle()
    google.pages = [{ contacts: [snapshot()], nextSyncToken: 'first' }]
    const syncTokens = tokenStore()

    const unlinked = memoryRepository(data({ people: [person('lotte')] }))
    expect(
      await runIncomingContactSync({
        repository: unlinked,
        gateway: google,
        syncTokens,
        labels: incomingLabels,
      }),
    ).toMatchObject({ updated: 0, fullRead: false })
    expect(google.fullReads).toBe(0)

    google.connected = false
    const repository = memoryRepository(linkedRobin())
    expect(
      await runIncomingContactSync({
        repository,
        gateway: google,
        syncTokens,
        labels: incomingLabels,
      }),
    ).toMatchObject({ waiting: true })

    google.connected = true
    await runIncomingContactSync({
      repository,
      gateway: google,
      syncTokens,
      labels: incomingLabels,
    })
    expect(google.fullReads).toBe(1)
    expect(syncTokens.tokens.get('account')).toBe('first')
    expect(repository.current.people[0]?.displayName).toBe('Robin Visser')
  })

  it('keeps the old token when storing the changes fails, so they are read again', async () => {
    const google = new ChangingGoogle()
    google.changes = [changeSet({ contacts: [snapshot()] })]
    const repository = memoryRepository(linkedRobin())
    repository.replaceData = async () => {
      throw new Error('disk full')
    }
    const syncTokens = tokenStore({ account: 'token-1' })

    await expect(
      runIncomingContactSync({ repository, gateway: google, syncTokens, labels: incomingLabels }),
    ).rejects.toThrow('disk full')
    expect(syncTokens.tokens.get('account')).toBe('token-1')
  })

  it('still writes a later Kindy edit with the etag Google returns', async () => {
    const google = new ChangingGoogle()
    google.changes = [changeSet({ contacts: [snapshot({ birthday: { month: 4, day: 4 } })] })]
    const repository = memoryRepository(linkedRobin())
    await runIncomingContactSync({
      repository,
      gateway: google,
      syncTokens: tokenStore({ account: 'token-1' }),
      labels: incomingLabels,
    })

    const edited = await repository.getData()
    const robin = edited.people[0]
    if (robin) robin.birthDate = { year: null, month: 5, day: 5 }
    edited.syncQueue = enqueueSync([], 'robin', 'update', 1, () => 'op', ['birthday'])
    await repository.replaceData(edited)
    google.contacts.set('people/robin', {
      etag: 'e5',
      birthdays: [{ month: 4, day: 4 }],
      events: [],
    })
    let usedEtag = ''
    google.updateContactFields = async (resourceName, etag, update) => {
      usedEtag = etag
      google.updates.push({ resourceName, update })
      return { etag: 'e6' }
    }

    await runContactSync({ repository, gateway: google, labels })

    expect(usedEtag).toBe('e5')
    // Google's birthday was the local copy, so it is replaced rather than added to.
    expect(google.updates[0]?.update).toEqual({
      updatePersonFields: ['birthdays'],
      birthdays: [{ month: 5, day: 5 }],
    })
    expect(repository.current.externalIdentities[0]?.etag).toBe('e6')
  })
})

describe('Google photos', () => {
  const options = { labels: incomingLabels, now: 9, newId: () => 'new-id' }

  it('shows the contact’s Google photo when Kindy has none', () => {
    const next = linkedRobin()
    const link = next.externalIdentities[0]!
    applyRemoteContact(next, link, snapshot({ photoUrl: 'https://photos.test/robin' }), options)
    expect(next.people[0]?.photoRef).toBe('https://photos.test/robin')
  })

  it('follows a new Google photo, also when nothing else changed', () => {
    const next = linkedRobin()
    const link = { ...next.externalIdentities[0]!, etag: 'e5' }
    next.externalIdentities[0] = link
    expect(
      applyRemoteContact(next, link, snapshot({ photoUrl: 'https://photos.test/robin' }), options),
    ).toBe(true)
    expect(next.people[0]?.photoRef).toBe('https://photos.test/robin')
  })

  it('keeps a photo picked in Kindy, which goes to Google instead', () => {
    const next = linkedRobin()
    next.people[0]!.photoRef = 'data:image/png;base64,AAAA'
    const link = next.externalIdentities[0]!
    applyRemoteContact(next, link, snapshot({ photoUrl: 'https://photos.test/robin' }), options)
    expect(next.people[0]?.photoRef).toBe('data:image/png;base64,AAAA')
  })
})
