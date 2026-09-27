import type { ContactUpdate, RemoteContactFields } from './contactSync'
import type {
  Circle,
  ContactDate,
  ContactEvent,
  ImportantEvent,
  Interaction,
  KindyData,
  Note,
  Person,
  Relationship,
  Reminder,
  UpcomingItem,
} from './model'

export interface PersonRepository {
  listPeople(options?: { includeArchived?: boolean; includeDeleted?: boolean }): Promise<Person[]>
  getPerson(id: string): Promise<Person | null>
  savePerson(person: Person): Promise<void>
  softDeletePerson(id: string, deletedAt: number): Promise<void>
  restorePerson(id: string): Promise<void>
}

export interface CircleRepository {
  listCircles(): Promise<Circle[]>
}

export interface RelationshipRepository {
  listRelationships(personId: string): Promise<Relationship[]>
}

export interface NoteRepository {
  listNotes(personId: string): Promise<Note[]>
}

export interface EventRepository {
  listEvents(): Promise<ImportantEvent[]>
}

export interface ReminderRepository {
  listReminders(): Promise<Reminder[]>
}

export interface InteractionRepository {
  listInteractions(personId: string): Promise<Interaction[]>
}

export interface KindyRepository
  extends
    PersonRepository,
    CircleRepository,
    RelationshipRepository,
    NoteRepository,
    EventRepository,
    ReminderRepository,
    InteractionRepository {
  initialize(): Promise<void>
  close(): Promise<void>
  getData(): Promise<KindyData>
  replaceData(data: KindyData): Promise<void>
  listUpcoming(now: number, limit?: number): Promise<UpcomingItem[]>
  search(query: string): Promise<Person[]>
}

export interface ExternalContactsGateway {
  getConnection(): Promise<ExternalContactsConnection | null>
  authorize(): Promise<ExternalContactsConnection>
  /** Reconnects without showing any Google UI; null when consent is needed first. */
  restore(): Promise<ExternalContactsConnection | null>
  listCandidates(pageToken?: string): Promise<ExternalContactsPage>
  fetchChanges(syncToken: string): Promise<ExternalContactsChangeSet>
  getContactFields(resourceName: string): Promise<{ etag: string } & RemoteContactFields>
  updateContactFields(
    resourceName: string,
    etag: string,
    update: ContactUpdate,
  ): Promise<{ etag: string }>
  createContact(input: NewExternalContact): Promise<{ resourceName: string; etag: string }>
  revoke(): Promise<void>
}

export interface NewExternalContact {
  givenName: string
  familyName?: string
  birthday: ContactDate | null
  events: ContactEvent[]
  phones: string[]
  emails: string[]
}

export interface ExternalContactsConnection {
  provider: 'google'
  providerAccountId: string
  displayName?: string
}

export interface ExternalContactSnapshot {
  resourceName: string
  etag: string
  displayName: string
  givenName?: string
  familyName?: string
  photoUrl?: string
  birthday?: ContactDate
  events: ContactEvent[]
  contactPoints: Array<{
    providerFieldId: string
    kind: 'phone' | 'email' | 'address' | 'url'
    label: string
    value: string
  }>
}

export interface ExternalContactsPage {
  contacts: ExternalContactSnapshot[]
  nextPageToken?: string
  nextSyncToken?: string
}

export interface ExternalContactsChangeSet {
  contacts: ExternalContactSnapshot[]
  deletedResourceNames: string[]
  nextSyncToken: string
  requiresFullRefresh: boolean
}

export interface SecurityGateway {
  availability(): Promise<boolean>
  isAppLockEnabled(): Promise<boolean>
  setAppLockEnabled(enabled: boolean): Promise<void>
  authenticate(): Promise<boolean>
  getDatabasePassphrase(): Promise<string>
}

export interface NotificationScheduler {
  reconcile(): Promise<void>
  cancelAll(): Promise<void>
}

export interface WidgetSnapshotWriter {
  writeSnapshot(data: Pick<KindyData, 'people' | 'events' | 'reminders'>): Promise<void>
}

/** A single Kindy backup in the user's own cloud storage (Google Drive app folder). */
export interface CloudBackupGateway {
  latest(): Promise<CloudBackupInfo | null>
  upload(content: string): Promise<CloudBackupInfo>
  download(id: string): Promise<string>
}

export interface CloudBackupInfo {
  id: string
  modifiedAt: number
  sizeBytes: number
}

export interface PhotoStore {
  importPhoto(uri: string): Promise<{ profileRef: string; thumbnailRef: string }>
  removePhoto(ref: string): Promise<void>
}

export interface Clock {
  now(): number
}

export interface IdGenerator {
  next(): string
}
