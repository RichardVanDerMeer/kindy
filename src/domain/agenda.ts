import { divorceEnding } from './marriage'
import type { EntityId, ImportantEvent, KindyData, PartialDate } from './model'

export type AgendaKind =
  | 'birthday'
  | 'wedding-anniversary'
  | 'anniversary'
  | 'memorial-death'
  | 'memorial-birth'
  | 'custom'
  | 'reminder'
  | 'appointment'

/** Filter groups shown in the Upcoming view. */
export type AgendaFilter =
  'birthday' | 'wedding' | 'memorial' | 'appointment' | 'reminder' | 'other'

export const agendaFilters: AgendaFilter[] = [
  'birthday',
  'wedding',
  'memorial',
  'appointment',
  'reminder',
  'other',
]

export interface AgendaItem {
  id: string
  kind: AgendaKind
  /** Local calendar day, YYYY-MM-DD. */
  date: string
  /** Whole days from today: 0 is today, negative is in the past. */
  daysFromToday: number
  personIds: EntityId[]
  /** Age, years married or years since, when the original year is known. */
  years?: number
  /** A memo that was ticked off: still shown, marked as done. */
  done?: boolean
  /** Title for custom events, reminders and appointments. */
  title?: string
  /** Start time of an appointment; absent for whole-day items. */
  startsAt?: number
  location?: string
}

export interface CalendarDay {
  year: number
  month: number
  day: number
}

export function calendarDay(date: Date): CalendarDay {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

function dayNumber(day: CalendarDay): number {
  return Math.round(Date.UTC(day.year, day.month - 1, day.day) / 86_400_000)
}

function isoDay(day: CalendarDay): string {
  return `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
}

function existsInYear(date: PartialDate, year: number): boolean {
  const candidate = new Date(Date.UTC(year, date.month - 1, date.day))
  return candidate.getUTCMonth() === date.month - 1
}

export function agendaFilterFor(kind: AgendaKind): AgendaFilter {
  switch (kind) {
    case 'birthday':
      return 'birthday'
    case 'wedding-anniversary':
      return 'wedding'
    case 'memorial-birth':
    case 'memorial-death':
      return 'memorial'
    case 'reminder':
      return 'reminder'
    case 'appointment':
      return 'appointment'
    default:
      return 'other'
  }
}

/**
 * Collects every birthday, anniversary, memorial and reminder in the window
 * [today - daysBack, today + daysAhead], sorted by date. Annual dates repeat
 * every year; a leap-day date is only shown in leap years.
 */
export function buildAgenda(
  data: KindyData,
  today: CalendarDay,
  window: { daysBack: number; daysAhead: number },
): AgendaItem[] {
  const todayNumber = dayNumber(today)
  const items: AgendaItem[] = []
  const deceased = new Set(
    data.people.filter((person) => person.isDeceased).map((person) => person.id),
  )
  const activePeople = new Set(
    data.people
      .filter((person) => !person.deletedAt && !person.isArchived)
      .map((person) => person.id),
  )

  function addAnnual(
    id: string,
    kind: AgendaKind,
    date: PartialDate,
    personIds: EntityId[],
    title?: string,
  ): void {
    for (const year of [today.year - 1, today.year, today.year + 1]) {
      if (!existsInYear(date, year)) continue
      const occurrence = { year, month: date.month, day: date.day }
      const offset = dayNumber(occurrence) - todayNumber
      if (offset < -window.daysBack || offset > window.daysAhead) continue
      const years = date.year === null ? undefined : year - date.year
      if (years !== undefined && years < 0) continue
      items.push({
        id: `${id}:${year}`,
        kind,
        date: isoDay(occurrence),
        daysFromToday: offset,
        personIds,
        years: years || undefined,
        title,
      })
    }
  }

  const birthdayEventPeople = new Set<EntityId>()
  for (const event of data.events) {
    const personIds = event.personIds.filter((id) => activePeople.has(id))
    if (event.personIds.length && !personIds.length) continue
    // A marriage that ended in divorce is no longer celebrated; other marriages still are.
    if (divorceEnding(event, data.events)) continue
    if (event.type === 'birthday') event.personIds.forEach((id) => birthdayEventPeople.add(id))
    addEventOccurrences(event, personIds)
  }

  function addEventOccurrences(event: ImportantEvent, personIds: EntityId[]): void {
    if (event.type === 'divorce') return
    if (event.type === 'custom' && event.date.year !== null) {
      const offset = dayNumber(event.date as CalendarDay) - todayNumber
      if (offset >= -window.daysBack && offset <= window.daysAhead) {
        items.push({
          id: event.id,
          kind: 'custom',
          date: isoDay(event.date as CalendarDay),
          daysFromToday: offset,
          personIds,
          title: event.title,
        })
      }
      return
    }
    const celebratesDeceased =
      event.type === 'birthday' && personIds.some((personId) => deceased.has(personId))
    const kind: AgendaKind = celebratesDeceased
      ? 'memorial-birth'
      : event.type === 'memorial'
        ? 'memorial-death'
        : event.type
    addAnnual(
      event.id,
      kind,
      event.date,
      personIds,
      event.type === 'custom' ? event.title : undefined,
    )
  }

  for (const person of data.people) {
    if (!activePeople.has(person.id)) continue
    if (person.birthDate && !birthdayEventPeople.has(person.id)) {
      addAnnual(
        `birth-${person.id}`,
        person.isDeceased ? 'memorial-birth' : 'birthday',
        person.birthDate,
        [person.id],
      )
    }
    if (person.isDeceased && person.deathDate) {
      addAnnual(`death-${person.id}`, 'memorial-death', person.deathDate, [person.id])
    }
  }

  for (const occurrence of data.reminderOccurrences) {
    if (occurrence.state !== 'scheduled' && occurrence.state !== 'completed') continue
    const reminder = data.reminders.find((candidate) => candidate.id === occurrence.reminderId)
    if (!reminder || reminder.isCancelled) continue
    const due = calendarDay(new Date(occurrence.snoozedUntil ?? occurrence.dueAt))
    const offset = dayNumber(due) - todayNumber
    if (offset < -window.daysBack || offset > window.daysAhead) continue
    items.push({
      id: occurrence.id,
      kind: 'reminder',
      date: isoDay(due),
      daysFromToday: offset,
      personIds: reminder.personId ? [reminder.personId] : [],
      title: reminder.title,
      done: occurrence.state === 'completed' || undefined,
    })
  }

  for (const link of data.calendarLinks) {
    if (link.status !== 'linked') continue
    const day = calendarDay(new Date(link.startsAt))
    const offset = dayNumber(day) - todayNumber
    if (offset < -window.daysBack || offset > window.daysAhead) continue
    items.push({
      id: link.id,
      kind: 'appointment',
      date: isoDay(day),
      daysFromToday: offset,
      personIds: link.personIds.filter((id) => activePeople.has(id)),
      title: link.title,
      startsAt: link.allDay ? undefined : link.startsAt,
      location: link.location,
    })
  }

  return items.sort(
    (left, right) =>
      left.daysFromToday - right.daysFromToday ||
      (left.startsAt ?? 0) - (right.startsAt ?? 0) ||
      left.id.localeCompare(right.id),
  )
}

/**
 * Filter selection for the Upcoming view. An empty selection means "all".
 * Picking a type while everything shows narrows to just that type; picking
 * more types adds them; clearing the last one returns to "all".
 */
export function toggleAgendaFilter(
  selected: ReadonlySet<AgendaFilter>,
  filter: AgendaFilter,
): Set<AgendaFilter> {
  const next = new Set(selected)
  if (next.has(filter)) next.delete(filter)
  else next.add(filter)
  return next.size === agendaFilters.length ? new Set() : next
}

export function matchesAgendaFilters(
  item: AgendaItem,
  selected: ReadonlySet<AgendaFilter>,
): boolean {
  return selected.size === 0 || selected.has(agendaFilterFor(item.kind))
}
