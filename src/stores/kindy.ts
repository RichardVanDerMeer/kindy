import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { buildAgenda, calendarDay } from '@/domain/agenda'
import type { AgendaDraft } from '@/domain/agendaDraft'
import { createBackup, isWorthBackingUp, readBackup } from '@/domain/backup'
import { sameOccurrence, suggestCalendarLinks, type DeviceCalendarEvent } from '@/domain/calendar'
import { createConnection } from '@/domain/connections'
import { enqueueSync, importedContactDates, managedContactFields } from '@/domain/contactSync'
import { safeWebUrl } from '@/domain/links'
import {
  KINDY_SCHEMA_VERSION,
  type Circle,
  type ContactPoint,
  type KindyData,
  type PartialDate,
  type Person,
  type RelationshipRole,
  type SyncField,
  type WishItem,
} from '@/domain/model'
import type {
  CalendarPermission,
  CloudBackupInfo,
  DeviceCalendar,
  ExternalContactsConnection,
  ExternalContactSnapshot,
} from '@/domain/ports'
import { getDeviceCalendarGateway } from '@/infrastructure/calendar/deviceCalendarGateway'
import {
  getCloudBackupGateway,
  NotConnectedError,
} from '@/infrastructure/backup/googleDriveBackupGateway'
import { getGoogleContactsGateway } from '@/infrastructure/contacts/googleContactsGateway'
import { getKindyRepository } from '@/infrastructure/repositories/repository'
import { runContactSync } from '@/infrastructure/sync/contactSyncRunner'
import { i18n } from '@/locales'

const repository = getKindyRepository()
const WRITE_BACK_KEY = 'kindy.google.writeBack'
const LAST_BACKUP_KEY = 'kindy.backup.lastAt'
const DAY = 86_400_000
/** Wait for a quiet moment after changes, so a burst of edits makes one backup. */
const BACKUP_DELAY = 30_000

function readLastBackup(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_BACKUP_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export type BackupState = 'idle' | 'running' | 'failed' | 'not-connected'

const DEFAULT_CALENDAR_KEY = 'kindy.calendar.default'

export interface PersonEdit {
  givenName: string
  familyName?: string
  nickname?: string
  birthDate?: PartialDate
  phones: string[]
  emails: string[]
  addresses: string[]
  photoRef?: string
  isDeceased: boolean
  deathDate?: PartialDate
  memorialNote?: string
}

export interface AppointmentEdit {
  title: string
  startsAt: number
  endsAt: number
  allDay: boolean
  location?: string
  personIds: string[]
}

const CALENDAR_PROMPT_KEY = 'kindy.calendar.promptDismissed'

function readCalendarPromptDismissed(): boolean {
  try {
    return localStorage.getItem(CALENDAR_PROMPT_KEY) === 'yes'
  } catch {
    return false
  }
}

export interface NewAppointment {
  title: string
  startsAt: number
  endsAt: number
  allDay: boolean
  location?: string
  personIds: string[]
}

function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function points(person: Person, kind: 'phone' | 'email'): string[] {
  return person.contactPoints.filter((point) => point.kind === kind).map((point) => point.value)
}

function samePartialDate(left?: PartialDate, right?: PartialDate): boolean {
  return left?.year === right?.year && left?.month === right?.month && left?.day === right?.day
}

function readWriteBack(): boolean {
  try {
    return localStorage.getItem(WRITE_BACK_KEY) !== 'off'
  } catch {
    return true
  }
}

export type ContactSyncStatus = 'local' | 'synced' | 'pending' | 'failed'

/** Death events written in any language Kindy supports. */
function deathLabels(): string[] {
  return i18n.global.availableLocales.map((locale) =>
    i18n.global.t('contactSync.deathEvent', {}, { locale }),
  )
}

export const useKindyStore = defineStore('kindy', () => {
  const initialized = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const data = ref<KindyData | null>(null)
  const today = ref(calendarDay(new Date()))
  const googleWriteBack = ref(readWriteBack())
  const googleSyncing = ref(false)
  const lastBackupAt = ref(readLastBackup())
  const backupState = ref<BackupState>('idle')
  let backupTimer: ReturnType<typeof setTimeout> | undefined
  const calendarPermission = ref<CalendarPermission>('prompt')
  const calendarEvents = ref<DeviceCalendarEvent[]>([])
  const calendars = ref<DeviceCalendar[]>([])
  const defaultCalendarId = ref(readDefaultCalendar())
  const calendarPromptDismissed = ref(readCalendarPromptDismissed())

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
  /** True once any person is linked to Google, i.e. an account has been connected. */
  const googleLinked = computed(() =>
    (data.value?.externalIdentities ?? []).some((identity) => identity.provider === 'google'),
  )
  const pendingSyncCount = computed(() => data.value?.syncQueue.length ?? 0)
  /** Appointments in the phone's calendar that look related to someone in Kindy. */
  const calendarSuggestions = computed(() =>
    data.value
      ? suggestCalendarLinks(calendarEvents.value, people.value, data.value.calendarLinks)
      : [],
  )
  /** From a week ago up to (not including) the same day next year; views narrow it further. */
  const agenda = computed(() =>
    data.value ? buildAgenda(data.value, today.value, { daysBack: 7, daysAhead: 364 }) : [],
  )

  async function initialize(): Promise<void> {
    if (initialized.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      await repository.initialize()
      await refresh()
      initialized.value = true
      window.addEventListener('online', () => void syncGoogle())
      void syncGoogle()
      void refreshCalendar()
      // At least one backup a day while Kindy is used.
      if (!lastBackupAt.value || Date.now() - lastBackupAt.value > DAY) scheduleBackup(5_000)
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
   * writes should replace it before larger datasets. Callers pass values from
   * reactive form state, so actions copy them: Vue proxies cannot be
   * structured-cloned into storage.
   */
  async function mutate(change: (draft: KindyData) => void): Promise<void> {
    const next = await repository.getData()
    change(next)
    await repository.replaceData(next)
    await refresh()
    scheduleBackup()
  }

  function scheduleBackup(delay = BACKUP_DELAY): void {
    clearTimeout(backupTimer)
    backupTimer = setTimeout(() => void backupNow(), delay)
  }

  function rememberBackup(at: number): void {
    lastBackupAt.value = at
    try {
      localStorage.setItem(LAST_BACKUP_KEY, String(at))
    } catch {
      // Only the "last backup" label is affected.
    }
  }

  /** Uploads the full Kindy data to the Google Drive app folder. */
  async function backupNow(): Promise<void> {
    clearTimeout(backupTimer)
    if (backupState.value === 'running' || !initialized.value) return
    const snapshot = await repository.getData()
    if (!isWorthBackingUp(snapshot)) return
    backupState.value = 'running'
    try {
      const info = await getCloudBackupGateway().upload(createBackup(snapshot, Date.now()))
      rememberBackup(info.modifiedAt)
      backupState.value = 'idle'
    } catch (caught) {
      backupState.value = caught instanceof NotConnectedError ? 'not-connected' : 'failed'
    }
  }

  /**
   * Looks for a backup. With `connect`, Google's sign-in is shown first when
   * needed, as on a new phone where nothing is linked yet.
   */
  async function findCloudBackup(connect = false): Promise<CloudBackupInfo | null> {
    if (connect) await getGoogleContactsGateway().authorize()
    return getCloudBackupGateway().latest()
  }

  /** Replaces all local Kindy data with the backup, after validating it. */
  async function restoreFromCloud(backupId: string): Promise<void> {
    const content = await getCloudBackupGateway().download(backupId)
    const backup = readBackup(content, KINDY_SCHEMA_VERSION)
    clearTimeout(backupTimer)
    await repository.replaceData(backup.data)
    await refresh()
    rememberBackup(backup.createdAt || Date.now())
    backupState.value = 'idle'
    void syncGoogle()
  }

  function isLinked(draft: KindyData, personId: string): boolean {
    return draft.externalIdentities.some(
      (identity) =>
        identity.personId === personId &&
        identity.provider === 'google' &&
        !identity.remoteDeletedAt,
    )
  }

  /**
   * Queues the changed fields of linked people for Google. With write-back off
   * they wait in the queue and are sent once it is switched on again.
   */
  function queueContactUpdates(draft: KindyData, personIds: string[], fields: SyncField[]): void {
    for (const personId of personIds) {
      if (!isLinked(draft, personId)) continue
      draft.syncQueue = enqueueSync(
        draft.syncQueue,
        personId,
        'update',
        Date.now(),
        () => crypto.randomUUID(),
        fields,
      )
    }
  }

  function queueContactCreate(draft: KindyData, personId: string): void {
    if (isLinked(draft, personId)) return
    draft.syncQueue = enqueueSync(draft.syncQueue, personId, 'create', Date.now(), () =>
      crypto.randomUUID(),
    )
  }

  async function syncGoogle(): Promise<void> {
    if (googleSyncing.value || !initialized.value) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    googleSyncing.value = true
    try {
      await runContactSync({
        repository,
        gateway: getGoogleContactsGateway(),
        labels: { death: i18n.global.t('contactSync.deathEvent') },
        onlyCreates: !googleWriteBack.value,
      })
      await refresh()
    } catch {
      // The queue is kept; a later change or reconnect retries it.
    } finally {
      googleSyncing.value = false
    }
  }

  function contactSyncStatus(personId: string): ContactSyncStatus {
    const operation = data.value?.syncQueue.find((candidate) => candidate.personId === personId)
    if (operation) return operation.state === 'failed' ? 'failed' : 'pending'
    return data.value && isLinked(data.value, personId) ? 'synced' : 'local'
  }

  async function retryContactSync(personId?: string): Promise<void> {
    await mutate((draft) => {
      for (const operation of draft.syncQueue) {
        if (!personId || operation.personId === personId) operation.state = 'pending'
      }
    })
    await syncGoogle()
  }

  /** Explicitly copies a Kindy-only person to Google Contacts. */
  async function saveToGoogle(personId: string): Promise<void> {
    await mutate((draft) => queueContactCreate(draft, personId))
    void syncGoogle()
  }

  async function setGoogleWriteBack(enabled: boolean): Promise<void> {
    googleWriteBack.value = enabled
    try {
      localStorage.setItem(WRITE_BACK_KEY, enabled ? 'on' : 'off')
    } catch {
      // Applies for this session.
    }
    // Changes made while write-back was off waited in the queue and are sent now.
    if (enabled) void syncGoogle()
  }

  async function lock(): Promise<void> {
    data.value = null
    initialized.value = false
    await repository.close()
  }

  async function savePerson(person: Person): Promise<void> {
    await repository.savePerson(person)
    await refresh()
    scheduleBackup()
  }

  async function addPerson(input: {
    givenName: string
    familyName?: string
    saveToGoogle?: boolean
  }): Promise<Person> {
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
    await mutate((draft) => {
      draft.people.push(person)
      if (input.saveToGoogle) queueContactCreate(draft, person.id)
    })
    if (input.saveToGoogle) void syncGoogle()
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
      const dates = importedContactDates(contact.birthday, contact.events, deathLabels())
      if (existingIdentity) {
        existingIdentity.etag = contact.etag
        existingIdentity.lastSyncedAt = Date.now()
        // Fill a missing birthday, but never overwrite one kept in Kindy.
        const linked = next.people.find((person) => person.id === existingIdentity.personId)
        if (linked && !linked.birthDate && dates.birthDate) {
          linked.birthDate = dates.birthDate
          existingIdentity.writtenFields = {
            birthday: contact.birthday ?? null,
            events: existingIdentity.writtenFields?.events ?? [],
          }
        }
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
        birthDate: dates.birthDate,
        deathDate: dates.deathDate,
        isFavorite: false,
        isArchived: false,
        isDeceased: Boolean(dates.deathDate),
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
      for (const date of dates.anniversaries) {
        next.events.push({
          id: crypto.randomUUID(),
          type: 'anniversary',
          title: 'anniversary',
          date,
          personIds: [personId],
          source: 'google',
          externalSourceRef: contact.resourceName,
        })
      }
      // The imported dates already live in Google: treat them as written, so a
      // later change in Kindy replaces them instead of adding a second value.
      const identity = next.externalIdentities.at(-1)
      if (identity) {
        identity.writtenFields = managedContactFields(personId, next, {
          death: i18n.global.t('contactSync.deathEvent'),
        })
      }
      imported += 1
    }

    await repository.replaceData(next)
    await refresh()
    scheduleBackup()
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
      queueContactUpdates(draft, [personId], ['birthday'])
    })
    void syncGoogle()
  }

  async function markDeceased(personId: string, deathDate: PartialDate): Promise<void> {
    await mutate((draft) => {
      const person = draft.people.find((candidate) => candidate.id === personId)
      if (!person) return
      person.isDeceased = true
      person.deathDate = { ...deathDate }
      person.updatedAt = Date.now()
      queueContactUpdates(draft, [personId], ['events'])
    })
    void syncGoogle()
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
      queueContactUpdates(draft, personIds, ['events'])
    })
    void syncGoogle()
  }

  function linkedToGoogle(personId: string): boolean {
    return data.value ? isLinked(data.value, personId) : false
  }

  /**
   * Saves edits to a person. For a linked contact the changed fields go to
   * Google, unless the user chose "keep in Kindy only" for this change; those
   * fields are then excluded from syncing until they are saved with sync on.
   */
  async function updatePerson(
    personId: string,
    edit: PersonEdit,
    options: { syncToGoogle: boolean },
  ): Promise<void> {
    await mutate((draft) => {
      const person = draft.people.find((candidate) => candidate.id === personId)
      if (!person) return
      const givenName = edit.givenName.trim()
      const familyName = edit.familyName?.trim() || undefined
      const phones = edit.phones.map((value) => value.trim()).filter(Boolean)
      const emails = edit.emails.map((value) => value.trim()).filter(Boolean)
      const addresses = edit.addresses.map((value) => value.trim()).filter(Boolean)

      const changed: SyncField[] = []
      if (givenName !== (person.givenName ?? '') || familyName !== person.familyName) {
        changed.push('name')
      }
      if (!sameList(phones, points(person, 'phone'))) changed.push('phones')
      if (!sameList(emails, points(person, 'email'))) changed.push('emails')
      if (!samePartialDate(edit.birthDate, person.birthDate)) changed.push('birthday')
      if (edit.photoRef !== person.photoRef) changed.push('photo')
      // A death is written to Google as an event.
      if (
        edit.isDeceased !== person.isDeceased ||
        (edit.isDeceased && !samePartialDate(edit.deathDate, person.deathDate))
      ) {
        changed.push('events')
      }

      person.givenName = givenName
      person.familyName = familyName
      person.displayName = [givenName, familyName].filter(Boolean).join(' ')
      person.nickname = edit.nickname?.trim() || undefined
      person.birthDate = edit.birthDate ? { ...edit.birthDate } : undefined
      person.photoRef = edit.photoRef
      person.isDeceased = edit.isDeceased
      person.deathDate = edit.isDeceased && edit.deathDate ? { ...edit.deathDate } : undefined
      person.memorialNote = edit.isDeceased ? edit.memorialNote?.trim() || undefined : undefined
      // Someone who has died is no favourite on the home screen any more.
      if (edit.isDeceased) person.isFavorite = false
      person.contactPoints = [
        ...updatedPoints(person, 'phone', phones),
        ...updatedPoints(person, 'email', emails),
        // Addresses stay in Kindy; they are not written to Google.
        ...updatedPoints(person, 'address', addresses),
        ...person.contactPoints.filter((point) => point.kind === 'url'),
      ]
      person.updatedAt = Date.now()

      if (!changed.length || !isLinked(draft, personId)) return
      const exclusions = new Set(person.syncExclusions ?? [])
      for (const field of changed) {
        if (options.syncToGoogle) exclusions.delete(field)
        else exclusions.add(field)
      }
      person.syncExclusions = exclusions.size ? [...exclusions] : undefined
      if (options.syncToGoogle) queueContactUpdates(draft, [personId], changed)
    })
    void syncGoogle()
  }

  /** Keeps ids and labels of numbers that stayed, so Google keeps its labels too. */
  function updatedPoints(
    person: Person,
    kind: 'phone' | 'email' | 'address',
    values: string[],
  ): ContactPoint[] {
    const existing = person.contactPoints.filter((point) => point.kind === kind)
    return values.map((value, index) => {
      const match = existing.find((point) => point.value === value)
      return (
        match ?? {
          id: crypto.randomUUID(),
          kind,
          label: kind === 'phone' ? 'mobile' : 'home',
          value,
          normalizedValue:
            kind === 'phone' ? value.replace(/[^\d+]/g, '') : value.toLocaleLowerCase(),
          isPrimary: index === 0,
          source: 'kindy' as const,
        }
      )
    })
  }

  /** The contact photo in Google, if the person is linked and has one. */
  async function googlePhoto(personId: string): Promise<string | undefined> {
    const identity = data.value?.externalIdentities.find(
      (candidate) => candidate.personId === personId && candidate.provider === 'google',
    )
    if (!identity) return undefined
    const gateway = getGoogleContactsGateway()
    if (!(await gateway.restore())) return undefined
    return (await gateway.getContactFields(identity.providerResourceId)).photoUrl
  }

  async function saveWish(
    input: Omit<WishItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<void> {
    const now = Date.now()
    await mutate((draft) => {
      const existing = input.id ? draft.wishes.find((wish) => wish.id === input.id) : undefined
      const values = {
        personId: input.personId,
        title: input.title.trim(),
        url: safeWebUrl(input.url),
        note: input.note?.trim() || undefined,
        status: input.status,
      }
      if (existing) Object.assign(existing, values, { updatedAt: now })
      else draft.wishes.push({ id: crypto.randomUUID(), ...values, createdAt: now, updatedAt: now })
    })
  }

  async function removeWish(wishId: string): Promise<void> {
    await mutate((draft) => {
      draft.wishes = draft.wishes.filter((wish) => wish.id !== wishId)
    })
  }

  function wishesFor(personId: string): WishItem[] {
    return (data.value?.wishes ?? []).filter((wish) => wish.personId === personId)
  }

  function readDefaultCalendar(): string | undefined {
    try {
      return localStorage.getItem(DEFAULT_CALENDAR_KEY) ?? undefined
    } catch {
      return undefined
    }
  }

  function setDefaultCalendar(calendarId: string): void {
    defaultCalendarId.value = calendarId
    try {
      localStorage.setItem(DEFAULT_CALENDAR_KEY, calendarId)
    } catch {
      // Applies for this session.
    }
  }

  /**
   * Reads the coming weeks from the phone's calendar. Linked appointments get
   * their copied title and time refreshed, so moves in the calendar show up.
   */
  async function refreshCalendar(): Promise<void> {
    const gateway = getDeviceCalendarGateway()
    try {
      calendarPermission.value = await gateway.permission()
      if (calendarPermission.value !== 'granted') return
      const now = Date.now()
      const [events, available] = await Promise.all([
        gateway.listEvents(now - 7 * DAY, now + 90 * DAY),
        gateway.listCalendars(),
      ])
      calendarEvents.value = events
      calendars.value = available
      const moved = (data.value?.calendarLinks ?? []).some((link) => {
        const event = events.find((candidate) => candidate.id === link.eventId)
        return event && (event.title !== link.title || event.location !== link.location)
      })
      if (moved) {
        await mutate((draft) => {
          for (const link of draft.calendarLinks) {
            const event = events.find((candidate) => sameOccurrence(link, candidate))
            if (!event) continue
            link.title = event.title
            link.location = event.location
            link.endsAt = event.endsAt
          }
        })
      }
    } catch {
      // Calendar access is optional; Kindy keeps working without it.
    }
  }

  async function connectCalendar(): Promise<void> {
    calendarPermission.value = await getDeviceCalendarGateway().requestPermission()
    await refreshCalendar()
  }

  async function linkCalendarEvent(event: DeviceCalendarEvent, personIds: string[]): Promise<void> {
    await mutate((draft) => {
      draft.calendarLinks = draft.calendarLinks.filter((link) => !sameOccurrence(link, event))
      draft.calendarLinks.push({
        id: crypto.randomUUID(),
        eventId: event.id,
        calendarId: event.calendarId,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
        location: event.location,
        personIds: [...personIds],
        status: 'linked',
        createdBy: 'calendar',
        createdAt: Date.now(),
      })
    })
  }

  async function ignoreCalendarEvent(event: DeviceCalendarEvent): Promise<void> {
    await mutate((draft) => {
      draft.calendarLinks.push({
        id: crypto.randomUUID(),
        eventId: event.id,
        calendarId: event.calendarId,
        title: event.title,
        startsAt: event.startsAt,
        allDay: event.allDay,
        personIds: [],
        status: 'ignored',
        createdBy: 'calendar',
        createdAt: Date.now(),
      })
    })
  }

  function dismissCalendarPrompt(): void {
    calendarPromptDismissed.value = true
    try {
      localStorage.setItem(CALENDAR_PROMPT_KEY, 'yes')
    } catch {
      // Applies for this session.
    }
  }

  /** Links a calendar appointment to a person by hand; others already linked stay linked. */
  async function linkEventToPerson(event: DeviceCalendarEvent, personId: string): Promise<void> {
    await mutate((draft) => {
      const existing = draft.calendarLinks.find((link) => sameOccurrence(link, event))
      if (existing) {
        existing.status = 'linked'
        if (!existing.personIds.includes(personId)) existing.personIds.push(personId)
        return
      }
      draft.calendarLinks.push({
        id: crypto.randomUUID(),
        eventId: event.id,
        calendarId: event.calendarId,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
        location: event.location,
        personIds: [personId],
        status: 'linked',
        createdBy: 'calendar',
        createdAt: Date.now(),
      })
    })
  }

  /**
   * Edits a linked appointment. Everyone can change who it is with; title,
   * time and place change only for appointments Kindy put in the calendar,
   * and then in the phone's calendar too. Other appointments are not touched.
   */
  async function updateAppointment(linkId: string, input: AppointmentEdit): Promise<void> {
    const link = data.value?.calendarLinks.find((candidate) => candidate.id === linkId)
    if (!link) return
    const ownAppointment = link.createdBy === 'kindy'
    const details = {
      title: input.title.trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      location: input.location?.trim() || undefined,
    }
    const detailsChanged =
      details.title !== link.title ||
      details.startsAt !== link.startsAt ||
      details.endsAt !== link.endsAt ||
      details.allDay !== link.allDay ||
      details.location !== link.location
    if (ownAppointment && detailsChanged) {
      await getDeviceCalendarGateway().updateEvent(link.eventId, details)
    }
    await mutate((draft) => {
      const stored = draft.calendarLinks.find((candidate) => candidate.id === linkId)
      if (!stored) return
      stored.personIds = [...input.personIds]
      if (ownAppointment) Object.assign(stored, details)
    })
    if (ownAppointment && detailsChanged) await refreshCalendar()
  }

  async function updateMemo(
    occurrenceId: string,
    input: { text: string; date: string; personId: string },
  ): Promise<void> {
    const localDateTime = `${input.date}T09:00:00`
    await mutate((draft) => {
      const occurrence = draft.reminderOccurrences.find((item) => item.id === occurrenceId)
      const reminder = draft.reminders.find((item) => item.id === occurrence?.reminderId)
      if (!occurrence || !reminder) return
      reminder.title = input.text.trim()
      reminder.personId = input.personId
      reminder.localDateTime = localDateTime
      occurrence.dueAt = new Date(localDateTime).getTime()
      occurrence.snoozedUntil = undefined
      occurrence.state = 'scheduled'
    })
  }

  async function deleteMemo(occurrenceId: string): Promise<void> {
    await mutate((draft) => {
      const occurrence = draft.reminderOccurrences.find((item) => item.id === occurrenceId)
      if (!occurrence) return
      draft.reminderOccurrences = draft.reminderOccurrences.filter(
        (item) => item.reminderId !== occurrence.reminderId,
      )
      draft.reminders = draft.reminders.filter((item) => item.id !== occurrence.reminderId)
    })
  }

  async function unlinkCalendarEvent(linkId: string): Promise<void> {
    await mutate((draft) => {
      draft.calendarLinks = draft.calendarLinks.filter((link) => link.id !== linkId)
    })
  }

  /** Adds an appointment to the phone's calendar and links it to the people involved. */
  async function createAppointment(input: NewAppointment): Promise<void> {
    const gateway = getDeviceCalendarGateway()
    if (calendarPermission.value !== 'granted') await connectCalendar()
    if (calendarPermission.value !== 'granted') throw new Error('Calendar permission denied')
    const calendarId =
      (calendars.value.some((calendar) => calendar.id === defaultCalendarId.value)
        ? defaultCalendarId.value
        : undefined) ??
      calendars.value.find((calendar) => calendar.isPrimary)?.id ??
      calendars.value[0]?.id
    if (!calendarId) throw new Error('No writable calendar')
    const { id } = await gateway.createEvent({
      calendarId,
      title: input.title.trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      location: input.location?.trim() || undefined,
    })
    await mutate((draft) => {
      draft.calendarLinks.push({
        id: crypto.randomUUID(),
        eventId: id,
        calendarId,
        title: input.title.trim(),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        allDay: input.allDay,
        location: input.location?.trim() || undefined,
        personIds: [...input.personIds],
        status: 'linked',
        createdBy: 'kindy',
        createdAt: Date.now(),
      })
    })
    await refreshCalendar()
  }

  /** Divorces and dates of the user's own choosing; they stay in Kindy. */
  async function addLifeEvent(input: {
    type: 'divorce' | 'custom'
    personIds: string[]
    date: PartialDate
    title?: string
  }): Promise<void> {
    await mutate((draft) => {
      draft.events.push({
        id: crypto.randomUUID(),
        type: input.type,
        title: input.title?.trim() || input.type,
        date: { ...input.date },
        personIds: [...input.personIds],
        source: 'kindy',
      })
    })
  }

  /** Removes a date. Linked contacts get the change too, when it is one Google holds. */
  async function removeEvent(eventId: string): Promise<void> {
    await mutate((draft) => {
      const event = draft.events.find((candidate) => candidate.id === eventId)
      if (!event) return
      draft.events = draft.events.filter((candidate) => candidate.id !== eventId)
      if (event.type === 'wedding-anniversary' || event.type === 'anniversary') {
        queueContactUpdates(draft, event.personIds, ['events'])
      }
    })
    void syncGoogle()
  }

  async function completeMemo(occurrenceId: string): Promise<void> {
    await mutate((draft) => {
      const occurrence = draft.reminderOccurrences.find((item) => item.id === occurrenceId)
      if (occurrence) occurrence.state = 'completed'
    })
  }

  /** Saves anything added from Upcoming or a timeline. */
  async function addFromDraft(draft: AgendaDraft): Promise<void> {
    switch (draft.kind) {
      case 'appointment':
        return createAppointment(draft)
      case 'memo':
        return addMemo(draft)
      case 'birthday':
        return setBirthDate(draft.personId, draft.date)
      case 'death':
        return markDeceased(draft.personId, draft.date)
      case 'wedding':
        return addWeddingAnniversary(draft.personIds, draft.date)
      case 'divorce':
        return addLifeEvent({ type: 'divorce', personIds: draft.personIds, date: draft.date })
      case 'custom':
        return addLifeEvent({
          type: 'custom',
          personIds: draft.personIds,
          date: draft.date,
          title: draft.title,
        })
    }
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
    googleWriteBack,
    googleSyncing,
    googleLinked,
    pendingSyncCount,
    lastBackupAt,
    backupState,
    calendarPermission,
    calendarEvents,
    calendars,
    defaultCalendarId,
    calendarSuggestions,
    calendarPromptDismissed,
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
    markDeceased,
    addWeddingAnniversary,
    syncGoogle,
    contactSyncStatus,
    retryContactSync,
    saveToGoogle,
    setGoogleWriteBack,
    backupNow,
    findCloudBackup,
    restoreFromCloud,
    linkedToGoogle,
    updatePerson,
    googlePhoto,
    saveWish,
    removeWish,
    wishesFor,
    setDefaultCalendar,
    refreshCalendar,
    connectCalendar,
    linkCalendarEvent,
    ignoreCalendarEvent,
    unlinkCalendarEvent,
    dismissCalendarPrompt,
    linkEventToPerson,
    updateAppointment,
    updateMemo,
    deleteMemo,
    createAppointment,
    addLifeEvent,
    removeEvent,
    completeMemo,
    addFromDraft,
    resetDemoData,
    importExternalContacts,
    search,
    circleMemberships,
    circleMembers,
    personById,
  }
})
