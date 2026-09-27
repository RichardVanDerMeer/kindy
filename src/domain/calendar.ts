import { normalizeText } from './duplicates'
import type { CalendarLink, EntityId, Person } from './model'

/** One occurrence of an appointment in the phone's calendar. */
export interface DeviceCalendarEvent {
  /** Calendar event id; recurring appointments share it across occurrences. */
  id: string
  calendarId: string
  calendarName?: string
  title: string
  startsAt: number
  endsAt?: number
  allDay: boolean
  location?: string
  attendeeEmails: string[]
}

export interface LinkSuggestion {
  event: DeviceCalendarEvent
  personIds: EntityId[]
  /** "attendee" when an invited email address belongs to someone in Kindy. */
  reason: 'attendee' | 'title'
}

export function sameOccurrence(link: CalendarLink, event: DeviceCalendarEvent): boolean {
  return link.eventId === event.id && link.startsAt === event.startsAt
}

function words(value: string): string[] {
  return normalizeText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false
  return haystack.some((_, start) =>
    needle.every((word, index) => haystack[start + index] === word),
  )
}

/**
 * Suggests which people an appointment is about. Guest email addresses are a
 * strong signal. Names in the title count when they are unambiguous: a full
 * name, or a first name of at least three letters that only one person has.
 * Appointments already linked or ignored are not suggested again.
 */
export function suggestCalendarLinks(
  events: DeviceCalendarEvent[],
  people: Person[],
  links: CalendarLink[],
): LinkSuggestion[] {
  const candidates = people.filter((person) => !person.isSelf && !person.deletedAt)
  const byEmail = new Map<string, EntityId>()
  for (const person of candidates) {
    for (const point of person.contactPoints) {
      if (point.kind === 'email') byEmail.set(point.value.trim().toLocaleLowerCase(), person.id)
    }
  }
  const givenNameCounts = new Map<string, number>()
  for (const person of candidates) {
    const given = normalizeText(person.givenName ?? '')
    if (given) givenNameCounts.set(given, (givenNameCounts.get(given) ?? 0) + 1)
  }

  const suggestions: LinkSuggestion[] = []
  for (const event of events) {
    if (links.some((link) => sameOccurrence(link, event))) continue

    const fromAttendees = new Set(
      event.attendeeEmails
        .map((email) => byEmail.get(email.trim().toLocaleLowerCase()))
        .filter((id): id is EntityId => Boolean(id)),
    )

    const titleWords = words(event.title)
    const fromTitle = candidates
      .filter((person) => {
        if (containsSequence(titleWords, words(person.displayName))) return true
        const given = normalizeText(person.givenName ?? '')
        return given.length >= 3 && givenNameCounts.get(given) === 1 && titleWords.includes(given)
      })
      .map((person) => person.id)

    const personIds = [...new Set([...fromAttendees, ...fromTitle])]
    if (personIds.length) {
      suggestions.push({ event, personIds, reason: fromAttendees.size ? 'attendee' : 'title' })
    }
  }
  return suggestions.sort((left, right) => left.event.startsAt - right.event.startsAt)
}
