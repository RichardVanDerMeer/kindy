import { nextPartialDate } from '@/domain/dates'
import { normalizeText } from '@/domain/duplicates'
import {
  KINDY_SCHEMA_VERSION,
  type ImportantEvent,
  type KindyData,
  type Person,
  type Reminder,
  type UpcomingItem,
} from '@/domain/model'
import type { KindyRepository } from '@/domain/ports'
import { demoData } from '@/fixtures/demo'

const STORAGE_KEY = 'kindy.local-data.v3'
const SCHEMA_VERSION = KINDY_SCHEMA_VERSION

function emptyData(): KindyData {
  return {
    schemaVersion: SCHEMA_VERSION,
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
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class BrowserKindyRepository implements KindyRepository {
  private data: KindyData = emptyData()

  async initialize(): Promise<void> {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      this.data = JSON.parse(stored) as KindyData
      this.data.externalIdentities ??= []
      if (import.meta.env.DEV && this.data.schemaVersion < SCHEMA_VERSION) {
        // Preview data is synthetic: reseed it rather than migrating old demo shapes.
        this.data = clone(demoData)
      } else if (this.data.schemaVersion < SCHEMA_VERSION) {
        for (const circle of this.data.circles) circle.isFavorite ??= false
        this.data.syncQueue ??= []
        this.data.schemaVersion = SCHEMA_VERSION
      }
      await this.persist()
      return
    }

    this.data = import.meta.env.DEV ? clone(demoData) : emptyData()
    await this.persist()
  }

  async close(): Promise<void> {
    // The browser adapter contains synthetic preview data only.
  }

  async getData(): Promise<KindyData> {
    return clone(this.data)
  }

  async replaceData(data: KindyData): Promise<void> {
    this.data = clone(data)
    await this.persist()
  }

  async listPeople(
    options: { includeArchived?: boolean; includeDeleted?: boolean } = {},
  ): Promise<Person[]> {
    return clone(
      this.data.people
        .filter((person) => options.includeArchived || !person.isArchived)
        .filter((person) => options.includeDeleted || !person.deletedAt)
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    )
  }

  async getPerson(id: string): Promise<Person | null> {
    return clone(this.data.people.find((person) => person.id === id) ?? null)
  }

  async savePerson(person: Person): Promise<void> {
    const index = this.data.people.findIndex((candidate) => candidate.id === person.id)
    if (index === -1) this.data.people.push(clone(person))
    else this.data.people[index] = clone(person)
    await this.persist()
  }

  async softDeletePerson(id: string, deletedAt: number): Promise<void> {
    const person = this.data.people.find((candidate) => candidate.id === id)
    if (!person) throw new Error('Person not found')
    person.deletedAt = deletedAt
    person.updatedAt = deletedAt
    await this.persist()
  }

  async restorePerson(id: string): Promise<void> {
    const person = this.data.people.find((candidate) => candidate.id === id)
    if (!person) throw new Error('Person not found')
    delete person.deletedAt
    person.updatedAt = Date.now()
    await this.persist()
  }

  async listCircles() {
    return clone(this.data.circles.filter((circle) => !circle.isArchived))
  }

  async listRelationships(personId: string) {
    return clone(
      this.data.relationships.filter(
        (relationship) =>
          relationship.fromPersonId === personId || relationship.toPersonId === personId,
      ),
    )
  }

  async listNotes(personId: string) {
    return clone(
      this.data.notes
        .filter((note) => note.personIds.includes(personId))
        .sort((left, right) => right.occurredAt - left.occurredAt),
    )
  }

  async listEvents(): Promise<ImportantEvent[]> {
    return clone(this.data.events)
  }

  async listReminders(): Promise<Reminder[]> {
    return clone(this.data.reminders)
  }

  async listInteractions(personId: string) {
    return clone(
      this.data.interactions
        .filter((interaction) => interaction.personIds.includes(personId))
        .sort((left, right) => right.occurredAt - left.occurredAt),
    )
  }

  async listUpcoming(now: number, limit = 20): Promise<UpcomingItem[]> {
    const eventItems: UpcomingItem[] = this.data.events.map((event) => ({
      id: event.id,
      kind: 'event',
      title: event.title,
      subtitle: event.type,
      dueAt: nextPartialDate(event.date, new Date(now)).getTime(),
      personIds: event.personIds,
    }))

    const reminderItems: UpcomingItem[] = this.data.reminderOccurrences
      .filter((occurrence) => occurrence.state === 'scheduled')
      .map((occurrence) => {
        const reminder = this.data.reminders.find((item) => item.id === occurrence.reminderId)
        return {
          id: occurrence.id,
          kind: 'reminder' as const,
          title: reminder?.title ?? 'Reminder',
          subtitle: 'reminder',
          dueAt: occurrence.snoozedUntil ?? occurrence.dueAt,
          personIds: reminder?.personId ? [reminder.personId] : [],
        }
      })

    return clone(
      [...eventItems, ...reminderItems]
        .filter((item) => item.dueAt >= now)
        .sort((left, right) => left.dueAt - right.dueAt)
        .slice(0, limit),
    )
  }

  async search(query: string): Promise<Person[]> {
    const normalizedQuery = normalizeText(query)
    if (!normalizedQuery) return this.listPeople()
    const circlePersonIds = new Set(
      this.data.memberships
        .filter((membership) => {
          const circle = this.data.circles.find((candidate) => candidate.id === membership.circleId)
          return normalizeText(`${circle?.name ?? ''} ${membership.role ?? ''}`).includes(
            normalizedQuery,
          )
        })
        .map((membership) => membership.personId),
    )

    return clone(
      this.data.people.filter((person) => {
        const notes = this.data.notes
          .filter((note) => note.personIds.includes(person.id))
          .map((note) => note.body)
          .join(' ')
        const haystack = normalizeText(
          [
            person.displayName,
            person.nickname,
            ...person.contactPoints.map((point) => point.value),
            ...person.details.map((detail) => `${detail.label} ${String(detail.value)}`),
            notes,
          ]
            .filter(Boolean)
            .join(' '),
        )
        return (
          !person.deletedAt &&
          (haystack.includes(normalizedQuery) || circlePersonIds.has(person.id))
        )
      }),
    )
  }

  private async persist(): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
  }
}
