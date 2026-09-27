/** Version of the Kindy data shape; storage adapters migrate up to it. */
export const KINDY_SCHEMA_VERSION = 5

export type EntityId = string
export type SourceKind = 'kindy' | 'google'

export interface ContactPoint {
  id: EntityId
  kind: 'phone' | 'email' | 'address' | 'url'
  label: string
  value: string
  normalizedValue: string
  isPrimary: boolean
  source: SourceKind
  sourceFieldId?: string
}

export interface PersonDetail {
  id: EntityId
  definitionId: EntityId
  label: string
  value: string | number | boolean
  valueType: 'text' | 'long-text' | 'date' | 'number' | 'boolean' | 'choice'
  source: SourceKind
  observedAt?: number
}

export interface Person {
  id: EntityId
  displayName: string
  givenName?: string
  middleName?: string
  familyName?: string
  nickname?: string
  pronouns?: string
  photoRef?: string
  /** Marks the person who uses Kindy ("Mij"). At most one person carries this flag. */
  isSelf?: boolean
  isFavorite: boolean
  isArchived: boolean
  isDeceased: boolean
  birthDate?: PartialDate
  deathDate?: PartialDate
  memorialNote?: string
  howWeMet?: string
  contactPoints: ContactPoint[]
  details: PersonDetail[]
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface ExternalIdentity {
  id: EntityId
  personId: EntityId
  provider: 'google'
  providerAccountId: string
  providerResourceId: string
  etag?: string
  lastSyncedAt?: number
  remoteDeletedAt?: number
  /** What Kindy last wrote to this contact, so a later write replaces only its own values. */
  writtenFields?: WrittenContactFields
}

export interface ContactDate {
  year?: number
  month: number
  day: number
}

export interface ContactEvent {
  /** Google's event type: "anniversary", "other" or a custom label such as "Overleden". */
  type: string
  date: ContactDate
}

export interface WrittenContactFields {
  birthday: ContactDate | null
  events: ContactEvent[]
}

/**
 * A pending change for the linked address book. Operations are coalesced per
 * person: the current Kindy values are read when the operation runs.
 */
export interface SyncOperation {
  id: EntityId
  personId: EntityId
  kind: 'create' | 'update'
  state: 'pending' | 'failed'
  attempts: number
  lastError?: string
  updatedAt: number
}

export interface Circle {
  id: EntityId
  name: string
  description?: string
  colorToken: CircleColor
  iconKey: string
  backgroundImageRef?: string
  isFavorite: boolean
  isArchived: boolean
}

export type CircleColor = 'family' | 'team' | 'work' | 'primary' | 'note' | 'neutral'

export interface CircleMembership {
  circleId: EntityId
  personId: EntityId
  role?: string
  startedOn?: string
  endedOn?: string
}

export type RelationshipType =
  | 'parent-of'
  | 'child-of'
  | 'partner-of'
  | 'sibling-of'
  | 'friend-of'
  | 'colleague-of'
  | 'introduced-by'
  | 'introduced'
  | 'custom'

/** A specific family or friendship role, used for labels and the family tree. */
export type RelationshipRole =
  | 'father'
  | 'mother'
  | 'parent'
  | 'son'
  | 'daughter'
  | 'child'
  | 'husband'
  | 'wife'
  | 'spouse'
  | 'partner'
  | 'brother'
  | 'sister'
  | 'sibling'
  | 'best-friend'
  | 'friend'

export interface Relationship {
  id: EntityId
  fromPersonId: EntityId
  toPersonId: EntityId
  type: RelationshipType
  customLabel?: string
  /** Free label shown on the from-person's profile, describing the to-person. */
  fromPersonLabel?: string
  /** Free label shown on the to-person's profile, describing the from-person. */
  toPersonLabel?: string
  /** Role shown on the from-person's profile, describing the to-person. */
  fromPersonRole?: RelationshipRole
  /** Role shown on the to-person's profile, describing the from-person. */
  toPersonRole?: RelationshipRole
  startedOn?: string
  endedOn?: string
  note?: string
}

export interface Note {
  id: EntityId
  body: string
  personIds: EntityId[]
  occurredAt: number
  isPinned: boolean
  createdAt: number
  updatedAt: number
}

export interface PartialDate {
  year: number | null
  month: number
  day: number
}

export interface ImportantEvent {
  id: EntityId
  type: 'birthday' | 'anniversary' | 'wedding-anniversary' | 'memorial' | 'custom'
  title: string
  date: PartialDate
  personIds: EntityId[]
  source: SourceKind
  externalSourceRef?: string
}

export type Recurrence =
  | { kind: 'once' }
  | { kind: 'daily'; interval: number }
  | { kind: 'weekly'; interval: number; weekdays: number[] }
  | { kind: 'monthly'; interval: number; day: number }
  | { kind: 'yearly'; interval: number; month: number; day: number }

export interface Reminder {
  id: EntityId
  personId?: EntityId
  noteId?: EntityId
  eventId?: EntityId
  interactionId?: EntityId
  title: string
  description?: string
  localDateTime: string
  timezone: string
  recurrence: Recurrence
  notificationOffsetsMinutes: number[]
  isCancelled: boolean
}

export type ReminderOccurrenceState = 'scheduled' | 'completed' | 'skipped' | 'cancelled'

export interface ReminderOccurrence {
  id: EntityId
  reminderId: EntityId
  dueAt: number
  state: ReminderOccurrenceState
  snoozedUntil?: number
}

export interface Interaction {
  id: EntityId
  type: 'conversation' | 'call' | 'message' | 'visit' | 'meal' | 'meeting' | 'event' | 'custom'
  personIds: EntityId[]
  occurredAt: number
  location?: string
  summary?: string
}

export interface KindyData {
  schemaVersion: number
  people: Person[]
  externalIdentities: ExternalIdentity[]
  circles: Circle[]
  memberships: CircleMembership[]
  relationships: Relationship[]
  notes: Note[]
  events: ImportantEvent[]
  reminders: Reminder[]
  reminderOccurrences: ReminderOccurrence[]
  interactions: Interaction[]
  syncQueue: SyncOperation[]
}

export interface UpcomingItem {
  id: EntityId
  kind: 'event' | 'reminder'
  title: string
  subtitle: string
  dueAt: number
  personIds: EntityId[]
}
