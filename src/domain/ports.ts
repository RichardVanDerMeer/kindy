import type {
  Circle,
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
  extends PersonRepository,
    CircleRepository,
    RelationshipRepository,
    NoteRepository,
    EventRepository,
    ReminderRepository,
    InteractionRepository {
  initialize(): Promise<void>
  getData(): Promise<KindyData>
  replaceData(data: KindyData): Promise<void>
  listUpcoming(now: number, limit?: number): Promise<UpcomingItem[]>
  search(query: string): Promise<Person[]>
}

export interface ExternalContactsGateway {
  authorize(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): Promise<boolean>
}

export interface SecurityGateway {
  isAppLockEnabled(): Promise<boolean>
  authenticate(): Promise<boolean>
  closeProtectedResources(): Promise<void>
}

export interface NotificationScheduler {
  reconcile(): Promise<void>
  cancelAll(): Promise<void>
}

export interface WidgetSnapshotWriter {
  writeSnapshot(data: Pick<KindyData, 'people' | 'events' | 'reminders'>): Promise<void>
}

export interface BackupGateway {
  export(password: string): Promise<string>
  restore(uri: string, password: string): Promise<void>
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
