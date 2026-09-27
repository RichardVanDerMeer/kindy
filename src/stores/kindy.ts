import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { buildAgenda, calendarDay } from '@/domain/agenda'
import { createConnection } from '@/domain/connections'
import type { Circle, KindyData, PartialDate, Person, RelationshipRole } from '@/domain/model'
import type { ExternalContactsConnection, ExternalContactSnapshot } from '@/domain/ports'
import { getKindyRepository } from '@/infrastructure/repositories/repository'

const repository = getKindyRepository()

export const useKindyStore = defineStore('kindy', () => {
  const initialized = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const data = ref<KindyData | null>(null)
  const today = ref(calendarDay(new Date()))

  const people = computed(() =>
    (data.value?.people ?? [])
      .filter((person) => !person.deletedAt && !person.isArchived)
      .sort((left, right) => left.displayName.localeCompare(right.displayName)),
  )
  const circles = computed(() => (data.value?.circles ?? []).filter((circle) => !circle.isArchived))
  const selfPerson = computed(() =>
    (data.value?.people ?? []).find((person) => person.isSelf && !person.deletedAt),
  )
  const favoritePeople = computed(() =>
    people.value.filter((person) => person.isFavorite && !person.isSelf),
  )
  const favoriteCircles = computed(() => circles.value.filter((circle) => circle.isFavorite))
  /** Everything from a week ago until a year ahead; views narrow it further. */
  const agenda = computed(() =>
    data.value ? buildAgenda(data.value, today.value, { daysBack: 7, daysAhead: 365 }) : [],
  )

  async function initialize(): Promise<void> {
    if (initialized.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      await repository.initialize()
      await refresh()
      initialized.value = true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  async function refresh(): Promise<void> {
    data.value = await repository.getData()
    today.value = calendarDay(new Date())
  }

  /**
   * Applies a change to a plain snapshot and stores it. This rewrites the full
   * dataset, which is fine for the current demo phase; targeted repository
   * writes should replace it before larger datasets.
   */
  // Callers pass values from reactive form state; copy them (as the actions below do)
  // because Vue proxies cannot be structured-cloned into storage.
  async function mutate(change: (draft: KindyData) => void): Promise<void> {
    const next = await repository.getData()
    change(next)
    await repository.replaceData(next)
    await refresh()
  }

  async function lock(): Promise<void> {
    data.value = null
    initialized.value = false
    await repository.close()
  }

  async function savePerson(person: Person): Promise<void> {
    await repository.savePerson(person)
    await refresh()
  }

  async function addPerson(input: { givenName: string; familyName?: string }): Promise<Person> {
    const now = Date.now()
    const givenName = input.givenName.trim()
    const familyName = input.familyName?.trim() || undefined
    const person: Person = {
      id: crypto.randomUUID(),
      displayName: [givenName, familyName].filter(Boolean).join(' '),
      givenName,
      familyName,
      isFavorite: false,
      isArchived: false,
      isDeceased: false,
      contactPoints: [],
      details: [],
      createdAt: now,
      updatedAt: now,
    }
    await savePerson(person)
    return person
  }

  async function toggleFavorite(personId: string): Promise<void> {
    const person = await repository.getPerson(personId)
    if (!person) return
    person.isFavorite = !person.isFavorite
    person.updatedAt = Date.now()
    await savePerson(person)
  }

  async function importExternalContacts(
    connection: ExternalContactsConnection,
    contacts: ExternalContactSnapshot[],
  ): Promise<{ imported: number; skipped: number }> {
    if (!data.value) throw new Error('Kindy is not initialized')
    // Read a plain repository snapshot here. Pinia wraps `data` deeply in Vue
    // proxies, which cannot be passed to structuredClone in the browser.
    const next = await repository.getData()
    let imported = 0
    let skipped = 0

    for (const contact of contacts) {
      const existingIdentity = next.externalIdentities.find(
        (identity) =>
          identity.provider === connection.provider &&
          identity.providerAccountId === connection.providerAccountId &&
          identity.providerResourceId === contact.resourceName,
      )
      if (existingIdentity) {
        existingIdentity.etag = contact.etag
        existingIdentity.lastSyncedAt = Date.now()
        skipped += 1
        continue
      }

      const now = Date.now()
      const personId = crypto.randomUUID()
      next.people.push({
        id: personId,
        displayName: contact.displayName,
        givenName: contact.givenName,
        familyName: contact.familyName,
        isFavorite: false,
        isArchived: false,
        isDeceased: false,
        contactPoints: contact.contactPoints.map((point, index) => ({
          id: crypto.randomUUID(),
          kind: point.kind,
          label: point.label,
          value: point.value,
          normalizedValue: point.value.trim().toLocaleLowerCase(),
          isPrimary: index === 0,
          source: 'google',
          sourceFieldId: point.providerFieldId,
        })),
        details: [],
        createdAt: now,
        updatedAt: now,
      })
      next.externalIdentities.push({
        id: crypto.randomUUID(),
        personId,
        provider: 'google',
        providerAccountId: connection.providerAccountId,
        providerResourceId: contact.resourceName,
        etag: contact.etag,
        lastSyncedAt: now,
      })
      imported += 1
    }

    await repository.replaceData(next)
    await refresh()
    return { imported, skipped }
  }

  async function setSelf(personId: string): Promise<void> {
    await mutate((draft) => {
      for (const person of draft.people) person.isSelf = person.id === personId || undefined
    })
  }

  async function toggleCircleFavorite(circleId: string): Promise<void> {
    await mutate((draft) => {
      const circle = draft.circles.find((candidate) => candidate.id === circleId)
      if (circle) circle.isFavorite = !circle.isFavorite
    })
  }

  async function saveCircle(circle: Circle): Promise<void> {
    await mutate((draft) => {
      const index = draft.circles.findIndex((candidate) => candidate.id === circle.id)
      if (index === -1) draft.circles.push({ ...circle })
      else draft.circles[index] = { ...circle }
    })
  }

  async function setPersonCircles(personId: string, circleIds: string[]): Promise<void> {
    await mutate((draft) => {
      draft.memberships = draft.memberships.filter(
        (membership) =>
          membership.personId !== personId ||
          membership.endedOn ||
          circleIds.includes(membership.circleId),
      )
      for (const circleId of circleIds) {
        const exists = draft.memberships.some(
          (membership) =>
            membership.personId === personId &&
            membership.circleId === circleId &&
            !membership.endedOn,
        )
        if (!exists) draft.memberships.push({ circleId, personId })
      }
    })
  }

  async function addConnection(
    subjectId: string,
    otherId: string,
    role: RelationshipRole,
  ): Promise<void> {
    await mutate((draft) => {
      draft.relationships.push(
        createConnection(crypto.randomUUID(), subjectId, otherId, role, draft.relationships),
      )
    })
  }

  async function removeConnection(relationshipId: string): Promise<void> {
    await mutate((draft) => {
      draft.relationships = draft.relationships.filter(
        (relationship) => relationship.id !== relationshipId,
      )
    })
  }

  async function setCircleMembers(circleId: string, personIds: string[]): Promise<void> {
    await mutate((draft) => {
      draft.memberships = draft.memberships.filter(
        (membership) =>
          membership.circleId !== circleId ||
          membership.endedOn ||
          personIds.includes(membership.personId),
      )
      for (const personId of personIds) {
        const exists = draft.memberships.some(
          (membership) =>
            membership.circleId === circleId &&
            membership.personId === personId &&
            !membership.endedOn,
        )
        if (!exists) draft.memberships.push({ circleId, personId })
      }
    })
  }

  async function addNote(input: {
    personIds: string[]
    body: string
    occurredAt: number
  }): Promise<void> {
    const now = Date.now()
    await mutate((draft) => {
      draft.notes.push({
        id: crypto.randomUUID(),
        body: input.body.trim(),
        personIds: [...input.personIds],
        occurredAt: input.occurredAt,
        isPinned: false,
        createdAt: now,
        updatedAt: now,
      })
    })
  }

  /** A dated memo for Upcoming: a one-time reminder on that day at 09:00 local time. */
  async function addMemo(input: { personId: string; text: string; date: string }): Promise<void> {
    const localDateTime = `${input.date}T09:00:00`
    const reminderId = crypto.randomUUID()
    await mutate((draft) => {
      draft.reminders.push({
        id: reminderId,
        personId: input.personId,
        title: input.text.trim(),
        localDateTime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        recurrence: { kind: 'once' },
        notificationOffsetsMinutes: [0],
        isCancelled: false,
      })
      draft.reminderOccurrences.push({
        id: crypto.randomUUID(),
        reminderId,
        dueAt: new Date(localDateTime).getTime(),
        state: 'scheduled',
      })
    })
  }

  async function setBirthDate(personId: string, birthDate: PartialDate): Promise<void> {
    await mutate((draft) => {
      const person = draft.people.find((candidate) => candidate.id === personId)
      if (!person) return
      person.birthDate = { ...birthDate }
      person.updatedAt = Date.now()
    })
  }

  async function addWeddingAnniversary(personIds: string[], date: PartialDate): Promise<void> {
    await mutate((draft) => {
      draft.events.push({
        id: crypto.randomUUID(),
        type: 'wedding-anniversary',
        title: 'Trouwdag',
        date: { ...date },
        personIds: [...personIds],
        source: 'kindy',
      })
    })
  }

  async function resetDemoData(): Promise<void> {
    if (!import.meta.env.DEV) return
    const { demoData } = await import('@/fixtures/demo')
    await repository.replaceData(structuredClone(demoData))
    await refresh()
  }

  async function search(query: string): Promise<Person[]> {
    return repository.search(query)
  }

  function circleMemberships(personId: string) {
    return (data.value?.memberships ?? [])
      .filter((membership) => membership.personId === personId && !membership.endedOn)
      .map((membership) => ({
        ...membership,
        circle: data.value?.circles.find((circle) => circle.id === membership.circleId),
      }))
  }

  function circleMembers(circleId: string): Person[] {
    const ids = new Set(
      (data.value?.memberships ?? [])
        .filter((membership) => membership.circleId === circleId && !membership.endedOn)
        .map((membership) => membership.personId),
    )
    return people.value.filter((person) => ids.has(person.id))
  }

  function personById(personId: string): Person | undefined {
    return data.value?.people.find((person) => person.id === personId)
  }

  return {
    initialized,
    loading,
    error,
    data,
    people,
    circles,
    selfPerson,
    favoritePeople,
    favoriteCircles,
    agenda,
    initialize,
    refresh,
    lock,
    savePerson,
    addPerson,
    toggleFavorite,
    toggleCircleFavorite,
    setSelf,
    saveCircle,
    setPersonCircles,
    addConnection,
    removeConnection,
    setCircleMembers,
    addNote,
    addMemo,
    setBirthDate,
    addWeddingAnniversary,
    resetDemoData,
    importExternalContacts,
    search,
    circleMemberships,
    circleMembers,
    personById,
  }
})
