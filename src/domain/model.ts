/** Version of the Kindy data shape; storage adapters migrate up to it. */
export const KINDY_SCHEMA_VERSION = 6

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
  /** "About": lasting background on this person, longer than interests, steadier than notes. */
  about?: string
  /** Work history; entries without an end are current. */
  jobs?: Job[]
  howWeMet?: string
  /** Fields the user chose to keep only in Kindy; they are never written to Google. */
  syncExclusions?: SyncField[]
  contactPoints: ContactPoint[]
  details: PersonDetail[]
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface Job {
  id: EntityId
  title?: string
  employer?: string
  /** Month the job started or ended, as YYYY-MM. */
  startedOn?: string
  endedOn?: string
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

/** Person fields that can be written to the linked address book. */
export type SyncField = 'name' | 'phones' | 'emails' | 'birthday' | 'events' | 'photo'

export interface ContactName {
  givenName?: string
  familyName?: string
  /**
   * Other parts of the remote name (middle name, prefixes, phonetic names),
   * passed back unchanged so an update never drops them.
   */
  preserved?: Record<string, unknown>
}

export interface WrittenContactFields {
  birthday: ContactDate | null
  events: ContactEvent[]
  name?: ContactName
  phones?: string[]
  emails?: string[]
  /** Labels per value ("mobile", "work", ...), sent to Google as its type. */
  phoneTypes?: Record<string, string>
  emailTypes?: Record<string, string>
  /** Hash of the last photo Kindy uploaded; photos themselves are not kept twice. */
  photoHash?: string
}

/**
 * A pending change for the linked address book. Operations are coalesced per
 * person: the current Kindy values are read when the operation runs.
 */
export interface SyncOperation {
  id: EntityId
  personId: EntityId
  kind: 'create' | 'update'
  /**
   * The fields the user changed. Only these are written, so a change to a
   * birthday can never overwrite a name or number that changed in Google.
   */
  fields?: SyncField[]
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
  /** A divorce is a life event only: it is never celebrated in Upcoming. */
  type: 'birthday' | 'anniversary' | 'wedding-anniversary' | 'divorce' | 'memorial' | 'custom'
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

export interface WishItem {
  id: EntityId
  personId: EntityId
  title: string
  url?: string
  note?: string
  status: 'idea' | 'bought' | 'given'
  createdAt: number
  updatedAt: number
}

/**
 * A link between people and an appointment in the phone's calendar. The title
 * and time are copied so Kindy can show the appointment without calendar access.
 */
export interface CalendarLink {
  id: EntityId
  eventId: string
  calendarId?: string
  title: string
  startsAt: number
  endsAt?: number
  allDay: boolean
  location?: string
  personIds: EntityId[]
  /** Ignored suggestions are remembered so they are not suggested again. */
  status: 'linked' | 'ignored'
  createdBy: 'kindy' | 'calendar'
  createdAt: number
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
  wishes: WishItem[]
  calendarLinks: CalendarLink[]
}

export interface UpcomingItem {
  id: EntityId
  kind: 'event' | 'reminder'
  title: string
  subtitle: string
  dueAt: number
  personIds: EntityId[]
}
