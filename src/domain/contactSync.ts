import type {
  ContactDate,
  ContactEvent,
  EntityId,
  KindyData,
  PartialDate,
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

/**
 * The fields Kindy owns in the linked address book: the birthday, wedding days
 * and anniversaries, and, for someone who has died, a custom death event.
 * Relationships stay in Kindy only.
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
  return {
    birthday: person?.birthDate ? toContactDate(person.birthDate) : null,
    events,
  }
}

export interface RemoteContactFields {
  birthdays: ContactDate[]
  events: ContactEvent[]
}

export interface ContactUpdate {
  updatePersonFields: Array<'birthdays' | 'events'>
  birthdays?: ContactDate[]
  events?: ContactEvent[]
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
): ContactUpdate | null {
  const update: ContactUpdate = { updatePersonFields: [] }

  const remoteBirthday = remote.birthdays[0] ?? null
  const birthdayChanged = current.birthday
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
  if (eventsChanged) {
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
