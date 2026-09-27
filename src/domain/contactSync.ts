import type {
  ContactDate,
  ContactEvent,
  ContactName,
  EntityId,
  KindyData,
  PartialDate,
  SyncField,
  WrittenContactFields,
} from './model'

/** Google's own type for anniversaries; wedding days are written with it. */
export const ANNIVERSARY_EVENT_TYPE = 'anniversary'

function fromContactDate(date: ContactDate): PartialDate {
  return { year: date.year ?? null, month: date.month, day: date.day }
}

export interface ImportedDates {
  birthDate?: PartialDate
  deathDate?: PartialDate
  anniversaries: PartialDate[]
}

/**
 * Reads dates from a Google contact. Anniversaries stay anniversaries (Google
 * does not say whether it is a wedding). A death event is recognised by the
 * labels Kindy itself writes, in any supported language.
 */
export function importedContactDates(
  birthday: ContactDate | undefined,
  events: ContactEvent[],
  deathLabels: string[],
): ImportedDates {
  const labels = deathLabels.map((label) => label.toLocaleLowerCase())
  const death = events.find((event) => labels.includes(event.type.toLocaleLowerCase()))
  return {
    birthDate: birthday ? fromContactDate(birthday) : undefined,
    deathDate: death ? fromContactDate(death.date) : undefined,
    anniversaries: events
      .filter((event) => event.type.toLocaleLowerCase() === ANNIVERSARY_EVENT_TYPE)
      .map((event) => fromContactDate(event.date)),
  }
}

function toContactDate(date: PartialDate): ContactDate {
  return date.year === null
    ? { month: date.month, day: date.day }
    : { year: date.year, month: date.month, day: date.day }
}

function sameDate(left: ContactDate, right: ContactDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day
}

function sameEvent(left: ContactEvent, right: ContactEvent): boolean {
  return (
    left.type.toLocaleLowerCase() === right.type.toLocaleLowerCase() &&
    sameDate(left.date, right.date)
  )
}

/** A small, stable fingerprint for a photo, to notice when it changed. */
export function photoFingerprint(photoRef: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < photoRef.length; index += 1) {
    hash ^= photoRef.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${photoRef.length}-${hash.toString(16)}`
}

/** Only photos chosen in Kindy (stored as data) are uploaded; remote URLs came from Google. */
export function uploadablePhoto(photoRef: string | undefined): string | undefined {
  return photoRef?.startsWith('data:image/') ? photoRef : undefined
}

/**
 * The fields Kindy keeps in step with the linked address book: name, phone
 * numbers, email addresses, birthday, wedding days and anniversaries, a death
 * event and the photo. Relationships stay in Kindy only.
 */
export function managedContactFields(
  personId: EntityId,
  data: KindyData,
  labels: { death: string },
): WrittenContactFields {
  const person = data.people.find((candidate) => candidate.id === personId)
  const events: ContactEvent[] = data.events
    .filter(
      (event) =>
        event.personIds.includes(personId) &&
        (event.type === 'wedding-anniversary' || event.type === 'anniversary'),
    )
    .map((event) => ({ type: ANNIVERSARY_EVENT_TYPE, date: toContactDate(event.date) }))
  if (person?.isDeceased && person.deathDate) {
    events.push({ type: labels.death, date: toContactDate(person.deathDate) })
  }
  const photo = uploadablePhoto(person?.photoRef)
  return {
    birthday: person?.birthDate ? toContactDate(person.birthDate) : null,
    events,
    name: { givenName: person?.givenName, familyName: person?.familyName },
    phones: contactValues(person, 'phone'),
    emails: contactValues(person, 'email'),
    photoHash: photo ? photoFingerprint(photo) : undefined,
  }
}

function contactValues(
  person: KindyData['people'][number] | undefined,
  kind: 'phone' | 'email',
): string[] {
  return (person?.contactPoints ?? [])
    .filter((point) => point.kind === kind)
    .map((point) => point.value)
}

/**
 * What Google holds after a sync: the current values, except for fields the
 * user keeps in Kindy only, which keep whatever was written before.
 */
export function writtenAfterSync(
  previous: WrittenContactFields | undefined,
  current: WrittenContactFields,
  excluded: SyncField[],
): WrittenContactFields {
  const keep = (field: SyncField) => excluded.includes(field)
  return {
    birthday: keep('birthday') ? (previous?.birthday ?? null) : current.birthday,
    events: keep('events') ? (previous?.events ?? []) : current.events,
    name: keep('name') ? previous?.name : current.name,
    phones: keep('phones') ? previous?.phones : current.phones,
    emails: keep('emails') ? previous?.emails : current.emails,
    photoHash: keep('photo') ? previous?.photoHash : (current.photoHash ?? previous?.photoHash),
  }
}

export interface ContactValue {
  value: string
  /** Google's label, such as "mobile" or "home"; kept when Kindy rewrites the list. */
  type?: string
}

export interface RemoteContactFields {
  birthdays: ContactDate[]
  events: ContactEvent[]
  name?: ContactName
  phones?: ContactValue[]
  emails?: ContactValue[]
  photoUrl?: string
}

export interface ContactUpdate {
  updatePersonFields: Array<'names' | 'phoneNumbers' | 'emailAddresses' | 'birthdays' | 'events'>
  names?: ContactName[]
  phoneNumbers?: ContactValue[]
  emailAddresses?: ContactValue[]
  birthdays?: ContactDate[]
  events?: ContactEvent[]
}

const normalizePhone = (value: string) => value.replace(/[^\d+]/g, '')
const normalizeEmail = (value: string) => value.trim().toLocaleLowerCase()

/**
 * Merges a multi-valued field: remote values Kindy did not write are kept,
 * values Kindy wrote before are replaced by the current ones.
 */
function mergeValues(
  remote: ContactValue[],
  previous: string[] | undefined,
  current: string[],
  normalize: (value: string) => string,
): ContactValue[] | null {
  const written = new Set((previous ?? []).map(normalize))
  const merged = remote.filter((item) => !written.has(normalize(item.value)))
  for (const value of current) {
    if (!merged.some((item) => normalize(item.value) === normalize(value))) {
      merged.push(remote.find((item) => normalize(item.value) === normalize(value)) ?? { value })
    }
  }
  const same =
    merged.length === remote.length &&
    merged.every((item) =>
      remote.some((candidate) => normalize(candidate.value) === normalize(item.value)),
    )
  return same ? null : merged
}

/**
 * Decides what to send so that only Kindy's own values change. Remote events
 * that Kindy did not write (for example a name day added in Google) are kept;
 * events Kindy wrote before are replaced by the current ones. Returns null
 * when the remote contact already matches.
 */
export function planContactUpdate(
  remote: RemoteContactFields,
  previous: WrittenContactFields | undefined,
  current: WrittenContactFields,
  excluded: SyncField[] = [],
): ContactUpdate | null {
  const update: ContactUpdate = { updatePersonFields: [] }

  if (!excluded.includes('name') && current.name?.givenName) {
    const remoteName = remote.name ?? {}
    if (
      (remoteName.givenName ?? '') !== (current.name.givenName ?? '') ||
      (remoteName.familyName ?? '') !== (current.name.familyName ?? '')
    ) {
      update.updatePersonFields.push('names')
      update.names = [{ givenName: current.name.givenName, familyName: current.name.familyName }]
    }
  }
  if (!excluded.includes('phones') && current.phones) {
    const phones = mergeValues(
      remote.phones ?? [],
      previous?.phones,
      current.phones,
      normalizePhone,
    )
    if (phones) {
      update.updatePersonFields.push('phoneNumbers')
      update.phoneNumbers = phones
    }
  }
  if (!excluded.includes('emails') && current.emails) {
    const emails = mergeValues(
      remote.emails ?? [],
      previous?.emails,
      current.emails,
      normalizeEmail,
    )
    if (emails) {
      update.updatePersonFields.push('emailAddresses')
      update.emailAddresses = emails
    }
  }

  const remoteBirthday = remote.birthdays[0] ?? null
  const birthdayChanged = excluded.includes('birthday')
    ? false
    : current.birthday
      ? !remoteBirthday || !sameDate(remoteBirthday, current.birthday)
      : Boolean(previous?.birthday && remoteBirthday && sameDate(remoteBirthday, previous.birthday))
  if (birthdayChanged) {
    update.updatePersonFields.push('birthdays')
    update.birthdays = current.birthday ? [current.birthday] : []
  }

  const kept = remote.events.filter(
    (event) => !(previous?.events ?? []).some((written) => sameEvent(written, event)),
  )
  const merged = [...kept]
  for (const event of current.events) {
    if (!merged.some((candidate) => sameEvent(candidate, event))) merged.push(event)
  }
  const eventsChanged =
    merged.length !== remote.events.length ||
    merged.some((event) => !remote.events.some((candidate) => sameEvent(candidate, event)))
  if (eventsChanged && !excluded.includes('events')) {
    update.updatePersonFields.push('events')
    update.events = merged
  }

  return update.updatePersonFields.length ? update : null
}

/** Adds or refreshes one pending operation per person and kind. */
export function enqueueSync(
  queue: KindyData['syncQueue'],
  personId: EntityId,
  kind: 'create' | 'update',
  now: number,
  id: () => string,
): KindyData['syncQueue'] {
  // A pending create already carries the latest values when it runs.
  if (kind === 'update' && queue.some((op) => op.personId === personId && op.kind === 'create')) {
    return queue
  }
  const existing = queue.find((op) => op.personId === personId && op.kind === kind)
  if (existing) {
    return queue.map((op) =>
      op === existing
        ? { ...op, state: 'pending', attempts: 0, lastError: undefined, updatedAt: now }
        : op,
    )
  }
  return [...queue, { id: id(), personId, kind, state: 'pending', attempts: 0, updatedAt: now }]
}
