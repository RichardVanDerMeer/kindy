import { computed, ref, toRaw } from 'vue'
import { defineStore } from 'pinia'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

import { buildAgenda, calendarDay } from '@/domain/agenda'
import type { AgendaDraft } from '@/domain/agendaDraft'
import { createBackup, isWorthBackingUp, readBackup } from '@/domain/backup'
import { sameOccurrence, suggestCalendarLinks, type DeviceCalendarEvent } from '@/domain/calendar'
import {
  childRoleForSibling,
  createConnection,
  isChildRole,
  isSiblingRole,
  siblingTargets,
} from '@/domain/connections'
import { enqueueSync, importedContactDates, managedContactFields } from '@/domain/contactSync'
import { normalizeContactLabel } from '@/domain/contactLabels'
import { effectiveEvents, isWeddingDay } from '@/domain/events'
import { applyRemoteContact } from '@/domain/incomingContacts'
import { safeWebUrl } from '@/domain/links'
import {
  KINDY_SCHEMA_VERSION,
  type Circle,
  type ContactPoint,
  type ImportantEvent,
  type KindyData,
  type PartialDate,
  type Job,
  type Person,
  type RelationshipRole,
  type SyncField,
  type WishItem,
} from '@/domain/model'
import {
  AccountMismatchError,
  type CalendarPermission,
  type CloudBackupInfo,
  type DeviceCalendar,
  type ExternalContactsConnection,
  type ExternalContactSnapshot,
  type KindyAccount,
  type KindyRepository,
} from '@/domain/ports'
import { getDeviceCalendarGateway } from '@/infrastructure/calendar/deviceCalendarGateway'
import {
  getCloudBackupGateway,
  NotConnectedError,
} from '@/infrastructure/backup/googleDriveBackupGateway'
import { getGoogleContactsGateway } from '@/infrastructure/contacts/googleContactsGateway'
import {
  belongsToAccount,
  openKindyRepository,
  previewAccount,
} from '@/infrastructure/repositories/repository'
import {
  runIncomingContactSync,
  type SyncTokenStore,
} from '@/infrastructure/sync/contactChangesRunner'
import { runContactSync } from '@/infrastructure/sync/contactSyncRunner'
import { i18n } from '@/locales'
import { useToastStore } from '@/stores/toast'

/** Stands in while no Google account is connected: Kindy has no data then (ADR 0005). */
const closedRepository = new Proxy({} as KindyRepository, {
  get() {
    return () => Promise.reject(new Error('No Google account is connected'))
  },
})
/** The open store of the connected account. */
let repository: KindyRepository = closedRepository
const SYNC_TOKEN_KEY = 'kindy.google.syncToken'
const LAST_BACKUP_KEY = 'kindy.backup.lastAt'
/** The connected Google account; "none" after an explicit disconnect. */
const ACCOUNT_KEY = 'kindy.google.account'

function readAccount(): KindyAccount | null {
  try {
    const stored = localStorage.getItem(ACCOUNT_KEY)
    if (stored === null) {
      // The browser preview connects its synthetic account until the user disconnects.
      return import.meta.env.DEV && !Capacitor.isNativePlatform() ? previewAccount : null
    }
    if (stored === 'none') return null
    const account = JSON.parse(stored) as Partial<KindyAccount>
    return account.id && account.email ? { ...account, id: account.id, email: account.email } : null
  } catch {
    return null
  }
}

function saveAccount(account: KindyAccount | null): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, account ? JSON.stringify(account) : 'none')
  } catch {
    // Kindy asks to connect again on the next start.
  }
}

/** The "last backup" time is kept per account, like the backup itself. */
function lastBackupKey(account: KindyAccount | null): string {
  return account ? `${LAST_BACKUP_KEY}.${account.id}` : LAST_BACKUP_KEY
}
const DAY = 86_400_000
/** Wait for a quiet moment after changes, so a burst of edits makes one backup. */
const BACKUP_DELAY = 30_000

function readLastBackup(account: KindyAccount | null): number | null {
  try {
    const value = Number(localStorage.getItem(lastBackupKey(account)))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export type BackupState = 'idle' | 'running' | 'failed' | 'not-connected'

const DEFAULT_CALENDAR_KEY = 'kindy.calendar.default'

/** A phone number, email address or address with its label ("mobile", "work", ...). */
export interface LabelledValue {
  value: string
  label: string
}

export interface PersonEdit {
  givenName: string
  familyName?: string
  nickname?: string
  birthDate?: PartialDate
  phones: LabelledValue[]
  emails: LabelledValue[]
  addresses: LabelledValue[]
  /** Social media and websites, e.g. { platform: 'linkedin', value: 'robin-chen' }. */
  /** Social media and other links; `label` is the platform, or a user's own label. */
  socials: Array<{ platform: string; label?: string; value: string }>
  jobs: Job[]
  interests?: string
  about?: string
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

/** Values with their labels, so a changed label also counts as a change. */
function labelledPoints(person: Person, kind: 'phone' | 'email'): string[] {
  return person.contactPoints
    .filter((point) => point.kind === kind)
    .map((point) => `${normalizeContactLabel(point.label)}|${point.value}`)
}

function cleanEntries(entries: LabelledValue[]): LabelledValue[] {
  return entries
    .map((entry) => ({ value: entry.value.trim(), label: entry.label.trim() || 'other' }))
    .filter((entry) => entry.value)
}

function samePartialDate(left?: PartialDate, right?: PartialDate): boolean {
  return left?.year === right?.year && left?.month === right?.month && left?.day === right?.day
}

/**
 * The People API sync token per Google account. Losing it only costs one full
 * read of the address book, so local storage is enough.
 */
const syncTokens: SyncTokenStore = {
  get(providerAccountId) {
    try {
      return localStorage.getItem(`${SYNC_TOKEN_KEY}.${providerAccountId}`) ?? undefined
    } catch {
      return undefined
    }
  },
  set(providerAccountId, token) {
    try {
      const key = `${SYNC_TOKEN_KEY}.${providerAccountId}`
      if (token) localStorage.setItem(key, token)
      else localStorage.removeItem(key)
    } catch {
      // The next run reads the full address book instead.
    }
  },
}

/** Forgets the account's sync token, so the next run reads all its contacts again. */
function forgetSyncTokens(account: KindyAccount): void {
  try {
    localStorage.removeItem(`${SYNC_TOKEN_KEY}.${account.id}`)
  } catch {
    // Nothing stored.
  }
}

export type ContactSyncStatus = 'local' | 'synced' | 'pending' | 'failed'

function sameWedding(left: ImportantEvent, right: ImportantEvent): boolean {
  return (
    left.date.month === right.date.month &&
    left.date.day === right.date.day &&
    left.personIds.some((personId) => right.personIds.includes(personId))
  )
}

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
  const googleSyncing = ref(false)
  const account = ref<KindyAccount | null>(readAccount())
  const lastBackupAt = ref(readLastBackup(account.value))
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
      ? suggestCalendarLinks(
          calendarEvents.value,
          people.value,
          data.value.calendarLinks,
          data.value.events,
        )
      : [],
  )
  /** From a week ago up to (not including) the same day next year; views narrow it further. */
  const agenda = computed(() =>
    data.value ? buildAgenda(data.value, today.value, { daysBack: 7, daysAhead: 364 }) : [],
  )

  async function initialize(): Promise<void> {
    if (initialized.value || loading.value) return
    const current = account.value
    getGoogleContactsGateway().useAccount(current)
    // Without an account there is no data to open; the app asks to connect.
    if (!current) return
    loading.value = true
    error.value = null
    try {
      repository = await openKindyRepository(current)
      lastBackupAt.value = readLastBackup(current)
      await repository.initialize()
      await refresh()
      initialized.value = true
      observeConnectivity()
      void syncGoogle({ pull: true })
      void refreshCalendar()
      // At least one backup a day while Kindy is used.
      if (!lastBackupAt.value || Date.now() - lastBackupAt.value > DAY) scheduleBackup(5_000)
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  /** Unlocking runs `initialize` again; the listeners are added once. */
  let connectivityObserved = false
  function observeConnectivity(): void {
    if (connectivityObserved) return
    connectivityObserved = true
    window.addEventListener('online', () => void syncGoogle({ pull: true }))
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void syncGoogle({ pull: true })
      })
    }
  }

  async function refresh(): Promise<void> {
    data.value = await repository.getData()
    today.value = calendarDay(new Date())
  }

  /** Stored changes run one after another, so a later change never lands first. */
  let pendingWrite: Promise<void> = Promise.resolve()
  /** Changes still being written; with syncing and backups this drives the activity bar. */
  const writing = ref(0)
  const busy = computed(
    () => writing.value > 0 || googleSyncing.value || backupState.value === 'running',
  )

  /**
   * Applies a change to a plain snapshot and stores it. This rewrites the full
   * dataset, which is fine for the current demo phase; targeted repository
   * writes should replace it before larger datasets. Callers pass values from
   * reactive form state, so actions copy them: Vue proxies cannot be
   * structured-cloned into storage.
   */
  async function mutate(change: (draft: KindyData) => void): Promise<void> {
    if (!data.value) throw new Error('Kindy is not initialized')
    // The screen updates at once; storing follows in order, in the background
    // of the user's next action. `toRaw` because Vue proxies cannot be cloned.
    const next = structuredClone(toRaw(data.value))
    change(next)
    data.value = next
    today.value = calendarDay(new Date())
    const write = pendingWrite.then(() => repository.replaceData(next))
    pendingWrite = write.catch(() => undefined)
    writing.value += 1
    try {
      await write
    } catch (caught) {
      // Show what is really stored again, and say so: a lost change must never be silent.
      await refresh()
      useToastStore().show(i18n.global.t('common.saveFailed'), 'error')
      throw caught
    } finally {
      writing.value -= 1
    }
    scheduleBackup()
  }

  function scheduleBackup(delay = BACKUP_DELAY): void {
    clearTimeout(backupTimer)
    backupTimer = setTimeout(() => void backupNow(), delay)
  }

  function rememberBackup(at: number): void {
    lastBackupAt.value = at
    try {
      localStorage.setItem(lastBackupKey(account.value), String(at))
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
    // The backup comes from this account's Drive, but never load another account's data.
    if (!account.value || !belongsToAccount(backup.data, account.value.id)) {
      throw new AccountMismatchError()
    }
    clearTimeout(backupTimer)
    await pendingWrite
    await repository.replaceData(backup.data)
    await refresh()
    rememberBackup(backup.createdAt || Date.now())
    backupState.value = 'idle'
    // The token belongs to the replaced data: read every contact again.
    forgetSyncTokens(account.value)
    void syncGoogle({ pull: true })
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

  /**
   * Sends queued changes to Google. With `pull`, changes made in Google are
   * read afterwards, so Kindy's own pending edits are sent before Google's
   * values come in.
   */
  async function syncGoogle(options: { pull?: boolean } = {}): Promise<void> {
    if (googleSyncing.value || !initialized.value) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    googleSyncing.value = true
    // The sync reads the stored data, so changes still being written go first.
    await pendingWrite
    const gateway = getGoogleContactsGateway()
    const death = i18n.global.t('contactSync.deathEvent')
    try {
      await runContactSync({
        repository,
        gateway,
        labels: { death },
      })
    } catch {
      // The queue is kept; a later change or reconnect retries it.
    }
    try {
      if (options.pull) {
        await runIncomingContactSync({
          repository,
          gateway,
          syncTokens,
          labels: { death, deathLabels: deathLabels() },
        })
      }
    } catch {
      // The sync token is kept; the next start, resume or reconnect reads the changes.
    } finally {
      // Locked while syncing: the database is closed and nothing is shown.
      if (initialized.value) await refresh()
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

  async function lock(): Promise<void> {
    data.value = null
    initialized.value = false
    await repository.close()
  }

  /**
   * Connects a Google account and opens its own Kindy data (ADR 0005). Only
   * possible while no account is connected: switching is disconnect, then connect.
   */
  async function connectGoogle(): Promise<KindyAccount> {
    if (account.value) throw new Error('A Google account is already connected')
    const gateway = getGoogleContactsGateway()
    gateway.useAccount(null)
    const connection = await gateway.authorize()
    if (!connection.email) throw new Error('Google did not return the account')
    const next: KindyAccount = {
      id: connection.providerAccountId,
      email: connection.email,
      displayName: connection.displayName,
    }
    gateway.useAccount(next)
    account.value = next
    saveAccount(next)
    await initialize()
    return next
  }

  /** Closes the account's data and shows nothing until an account is connected again. */
  async function closeAccount(): Promise<void> {
    clearTimeout(backupTimer)
    data.value = null
    initialized.value = false
    await repository.close().catch(() => undefined)
    repository = closedRepository
    account.value = null
    saveAccount(null)
    getGoogleContactsGateway().useAccount(null)
    lastBackupAt.value = null
    backupState.value = 'idle'
  }

  /**
   * Disconnects Google (ADR 0005, section 3). The account's data stays on the
   * device and in Drive, including changes not yet sent to Google.
   */
  async function disconnectGoogle(): Promise<void> {
    try {
      await getGoogleContactsGateway().revoke()
    } catch {
      // Offline or already revoked: Kindy forgets the account either way.
    }
    await closeAccount()
  }

  /**
   * Deletes the connected account's Kindy data from this device, and with
   * `fromDrive` also its backup in Drive, then disconnects (ADR 0005,
   * section 4). Google Contacts are never touched.
   */
  async function wipeAccount(options: { fromDrive: boolean }): Promise<void> {
    const current = account.value
    if (!current) return
    clearTimeout(backupTimer)
    // Drive first: if that fails, the local data is still there to try again.
    if (options.fromDrive) await getCloudBackupGateway().remove()
    await repository.destroy()
    repository = closedRepository
    forgetSyncTokens(current)
    try {
      localStorage.removeItem(lastBackupKey(current))
    } catch {
      // Only the "last backup" label.
    }
    await disconnectGoogle()
  }

  async function savePerson(person: Person): Promise<void> {
    await repository.savePerson(person)
    await refresh()
    scheduleBackup()
  }

  /** People live in Google Contacts (ADR 0004): every new person becomes a contact. */
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
    await mutate((draft) => {
      draft.people.push(person)
      queueContactCreate(draft, person.id)
    })
    void syncGoogle()
    return person
  }

  async function toggleFavorite(personId: string): Promise<void> {
    await mutate((draft) => {
      const person = draft.people.find((candidate) => candidate.id === personId)
      if (!person) return
      person.isFavorite = !person.isFavorite
      person.updatedAt = Date.now()
    })
  }

  async function importExternalContacts(
    connection: ExternalContactsConnection,
    contacts: ExternalContactSnapshot[],
  ): Promise<{ imported: number; skipped: number }> {
    if (!data.value) throw new Error('Kindy is not initialized')
    // Contacts of another account never enter this account's data.
    if (connection.providerAccountId !== account.value?.id) throw new AccountMismatchError()
    await pendingWrite
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
        // Already linked: refresh the local copy of the Google fields.
        applyRemoteContact(next, existingIdentity, contact, {
          labels: { death: i18n.global.t('contactSync.deathEvent'), deathLabels: deathLabels() },
          now: Date.now(),
          newId: () => crypto.randomUUID(),
        })
        skipped += 1
        continue
      }
      const dates = importedContactDates(contact.birthday, contact.events, deathLabels())

      const now = Date.now()
      const personId = crypto.randomUUID()
      next.people.push({
        id: personId,
        displayName: contact.displayName,
        givenName: contact.givenName,
        familyName: contact.familyName,
        // The contact's Google photo is the starting profile photo.
        photoRef: contact.photoUrl,
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

  /**
   * Adds several connections at once. With `alsoForPartnerId`, children are
   * also linked to that partner. Connections that already exist are skipped.
   */
  async function addConnections(
    subjectId: string,
    connections: Array<{ personId: string; role: RelationshipRole }>,
    options: { alsoForPartnerId?: string; alsoForSiblings?: boolean } = {},
  ): Promise<{ added: number; skipped: number }> {
    let added = 0
    let skipped = 0
    await mutate((draft) => {
      const link = (from: string, to: string, role: RelationshipRole): boolean => {
        try {
          draft.relationships.push(
            createConnection(crypto.randomUUID(), from, to, role, draft.relationships),
          )
          return true
        } catch {
          return false
        }
      }
      for (const connection of connections) {
        if (link(subjectId, connection.personId, connection.role)) added += 1
        else skipped += 1
        const partnerId = options.alsoForPartnerId
        if (partnerId && partnerId !== connection.personId && isChildRole(connection.role)) {
          link(partnerId, connection.personId, connection.role)
        }
        // A brother or sister also belongs with the subject's parents, or next to the other siblings.
        const targets = options.alsoForSiblings
          ? siblingTargets(subjectId, draft.relationships)
          : null
        if (targets && isSiblingRole(connection.role)) {
          for (const targetId of targets.personIds) {
            if (targetId === connection.personId) continue
            if (targets.kind === 'parents') {
              link(targetId, connection.personId, childRoleForSibling(connection.role))
            } else {
              link(targetId, connection.personId, connection.role)
            }
          }
        }
      }
    })
    return { added, skipped }
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
      const phones = cleanEntries(edit.phones)
      const emails = cleanEntries(edit.emails)
      const addresses = cleanEntries(edit.addresses)
      const socials = edit.socials
        .map((social) => ({
          label: social.platform === 'other' ? social.label?.trim() || 'Link' : social.platform,
          value: social.value.trim(),
        }))
        .filter((social) => social.value)

      const changed: SyncField[] = []
      if (givenName !== (person.givenName ?? '') || familyName !== person.familyName) {
        changed.push('name')
      }
      const keyed = (entries: LabelledValue[]) =>
        entries.map((entry) => `${entry.label}|${entry.value}`)
      if (!sameList(keyed(phones), labelledPoints(person, 'phone'))) changed.push('phones')
      if (!sameList(keyed(emails), labelledPoints(person, 'email'))) changed.push('emails')
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
        // Addresses and social links stay in Kindy; they are not written to Google.
        ...updatedPoints(person, 'address', addresses),
        ...updatedPoints(person, 'url', socials),
      ]
      person.jobs = edit.jobs
        .map((job) => ({
          id: job.id,
          title: job.title?.trim() || undefined,
          employer: job.employer?.trim() || undefined,
          startedOn: job.startedOn || undefined,
          endedOn: job.endedOn || undefined,
        }))
        .filter((job) => job.title || job.employer)
      person.about = edit.about?.trim() || undefined
      person.details = updatedDetails(person, { interests: edit.interests })
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

  /** Keeps the ids of values that stayed and takes the (possibly changed) label. */
  function updatedPoints(
    person: Person,
    kind: ContactPoint['kind'],
    entries: LabelledValue[],
  ): ContactPoint[] {
    const existing = person.contactPoints.filter((point) => point.kind === kind)
    return entries.map((entry, index) => {
      const match = existing.find((point) => point.value === entry.value)
      if (match) return { ...match, label: entry.label, isPrimary: index === 0 }
      return {
        id: crypto.randomUUID(),
        kind,
        label: entry.label,
        value: entry.value,
        normalizedValue:
          kind === 'phone' ? entry.value.replace(/[^\d+]/g, '') : entry.value.toLocaleLowerCase(),
        isPrimary: index === 0,
        source: 'kindy' as const,
      }
    })
  }

  /** Work, employer and interests are details with fixed definitions. */
  function updatedDetails(
    person: Person,
    values: Record<'interests', string | undefined>,
  ): Person['details'] {
    // Occupation and employer moved into the job list.
    const managed = [...Object.keys(values), 'occupation', 'employer']
    const kept = person.details.filter((detail) => !managed.includes(detail.definitionId))
    const next = Object.entries(values).flatMap(([definitionId, value]) => {
      const trimmed = value?.trim()
      if (!trimmed) return []
      const existing = person.details.find((detail) => detail.definitionId === definitionId)
      return [
        {
          id: existing?.id ?? crypto.randomUUID(),
          definitionId,
          label: definitionId,
          value: trimmed,
          valueType: definitionId === 'interests' ? ('long-text' as const) : ('text' as const),
          source: 'kindy' as const,
        },
      ]
    })
    return [...next, ...kept]
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

  /** Opens a linked appointment in the phone's calendar app. */
  async function openInCalendar(linkId: string): Promise<void> {
    const link = data.value?.calendarLinks.find((candidate) => candidate.id === linkId)
    if (!link) return
    await getDeviceCalendarGateway().openEvent(link.eventId, link.startsAt, link.endsAt)
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
      // The ended marriage's anniversary is taken out of linked Google contacts.
      if (input.type === 'divorce') queueContactUpdates(draft, input.personIds, ['events'])
    })
    if (input.type === 'divorce') void syncGoogle()
  }

  /** Removes a date. Linked contacts get the change too, when it is one Google holds. */
  async function removeEvent(eventId: string): Promise<void> {
    await mutate((draft) => {
      const event = draft.events.find((candidate) => candidate.id === eventId)
      if (!event) return
      // A wedding day is shown once per couple: remove every copy of it, from Kindy and Google.
      const shown = effectiveEvents(draft).find(
        (candidate) => candidate.id === eventId || sameWedding(candidate, event),
      )
      const people = new Set([...event.personIds, ...(shown?.personIds ?? [])])
      draft.events = draft.events.filter(
        (candidate) =>
          candidate.id !== eventId &&
          !(
            isWeddingDay(event) &&
            isWeddingDay(candidate) &&
            candidate.date.month === event.date.month &&
            candidate.date.day === event.date.day &&
            candidate.personIds.some((personId) => people.has(personId))
          ),
      )
      if (event.type === 'wedding-anniversary' || event.type === 'anniversary') {
        queueContactUpdates(draft, [...people], ['events'])
      }
    })
    void syncGoogle()
  }

  /** Ticks a memo off, or back on. A finished memo stays visible as done. */
  async function toggleMemoDone(occurrenceId: string): Promise<void> {
    await mutate((draft) => {
      const occurrence = draft.reminderOccurrences.find((item) => item.id === occurrenceId)
      if (!occurrence) return
      occurrence.state = occurrence.state === 'completed' ? 'scheduled' : 'completed'
    })
  }

  async function removeNote(noteId: string): Promise<void> {
    await mutate((draft) => {
      draft.notes = draft.notes.filter((note) => note.id !== noteId)
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
    account,
    busy,
    connectGoogle,
    disconnectGoogle,
    wipeAccount,
    people,
    circles,
    selfPerson,
    favoritePeople,
    favoriteCircles,
    agenda,
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
    addConnections,
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
    openInCalendar,
    unlinkCalendarEvent,
    dismissCalendarPrompt,
    linkEventToPerson,
    updateAppointment,
    updateMemo,
    deleteMemo,
    createAppointment,
    addLifeEvent,
    removeEvent,
    toggleMemoDone,
    removeNote,
    addFromDraft,
    resetDemoData,
    importExternalContacts,
    search,
    circleMemberships,
    circleMembers,
    personById,
  }
})
