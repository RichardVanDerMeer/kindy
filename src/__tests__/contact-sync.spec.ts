import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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
import type { ExternalContactsGateway, NewExternalContact } from '@/domain/ports'
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

  async getConnection() {
    return null
  }
  async authorize() {
    return { provider: 'google' as const, providerAccountId: 'account' }
  }
  async restore() {
    return this.connected ? this.authorize() : null
  }
  async listCandidates() {
    return { contacts: [] }
  }
  async fetchChanges(syncToken: string) {
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

  it('has no way to delete a Google contact', () => {
    const plugin = readFileSync(
      'android/app/src/main/java/nl/richardvandermeer/kindy/contacts/KindyGoogleContactsPlugin.kt',
      'utf8',
    )
    expect(plugin).not.toMatch(/deleteContact|batchDelete|"DELETE"/)
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
