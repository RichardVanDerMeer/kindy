import { describe, expect, it } from 'vitest'

import { buildAgenda } from '@/domain/agenda'
import { suggestCalendarLinks, type DeviceCalendarEvent } from '@/domain/calendar'
import type { KindyData, Person } from '@/domain/model'

function person(id: string, displayName: string, overrides: Partial<Person> = {}): Person {
  const [givenName] = displayName.split(' ')
  return {
    id,
    displayName,
    givenName,
    isFavorite: false,
    isArchived: false,
    isDeceased: false,
    contactPoints: [],
    details: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function event(id: string, title: string, overrides: Partial<DeviceCalendarEvent> = {}) {
  return {
    id,
    calendarId: 'c',
    title,
    startsAt: 1_000,
    allDay: false,
    attendeeEmails: [],
    ...overrides,
  } satisfies DeviceCalendarEvent
}

const people = [
  person('robin', 'Robin Chen', {
    contactPoints: [
      {
        id: 'e',
        kind: 'email',
        label: 'home',
        value: 'Robin@Example.com',
        normalizedValue: 'robin@example.com',
        isPrimary: true,
        source: 'kindy',
      },
    ],
  }),
  person('daan', 'Daan Visser'),
  person('emma-1', 'Emma van der Meer'),
  person('emma-2', 'Emma de Vries'),
  person('me', 'Richard van der Meer', { isSelf: true }),
]

describe('calendar suggestions', () => {
  it('matches guests by email and unambiguous first names in the title', () => {
    const suggestions = suggestCalendarLinks(
      [
        event('dinner', 'Uit eten', { attendeeEmails: ['robin@example.com'] }),
        event('padel', 'Padel met Daan'),
        event('dentist', 'Tandarts'),
      ],
      people,
      [],
    )
    expect(
      suggestions.map((suggestion) => [
        suggestion.event.id,
        suggestion.personIds,
        suggestion.reason,
      ]),
    ).toEqual([
      ['dinner', ['robin'], 'attendee'],
      ['padel', ['daan'], 'title'],
    ])
  })

  it('needs the full name when a first name is shared, and never suggests the user', () => {
    const suggestions = suggestCalendarLinks(
      [
        event('party', 'Feestje Emma'),
        event('party-2', 'Verjaardag Emma de Vries'),
        event('me', 'Richard naar de kapper'),
      ],
      people,
      [],
    )
    expect(suggestions.map((suggestion) => [suggestion.event.id, suggestion.personIds])).toEqual([
      ['party-2', ['emma-2']],
    ])
  })

  it('does not suggest appointments that were linked or ignored before', () => {
    const suggestions = suggestCalendarLinks([event('padel', 'Padel met Daan')], people, [
      {
        id: 'l',
        eventId: 'padel',
        title: 'Padel met Daan',
        startsAt: 1_000,
        allDay: false,
        personIds: [],
        status: 'ignored',
        createdBy: 'calendar',
        createdAt: 0,
      },
    ])
    expect(suggestions).toEqual([])
  })

  it('shows linked appointments in Upcoming, in time order within a day', () => {
    const noon = new Date(2026, 8, 27, 12).getTime()
    const data: KindyData = {
      schemaVersion: 6,
      people,
      externalIdentities: [],
      circles: [],
      memberships: [],
      relationships: [],
      notes: [],
      events: [],
      reminders: [],
      reminderOccurrences: [],
      interactions: [],
      syncQueue: [],
      wishes: [],
      calendarLinks: [
        ['late', noon + 7 * 3_600_000],
        ['early', noon - 2 * 3_600_000],
      ].map(([id, startsAt]) => ({
        id: String(id),
        eventId: String(id),
        title: String(id),
        startsAt: Number(startsAt),
        allDay: false,
        personIds: ['daan'],
        status: 'linked' as const,
        createdBy: 'kindy' as const,
        createdAt: 0,
      })),
    }
    const agenda = buildAgenda(
      data,
      { year: 2026, month: 9, day: 27 },
      { daysBack: 0, daysAhead: 1 },
    )
    expect(agenda.map((item) => [item.kind, item.title])).toEqual([
      ['appointment', 'early'],
      ['appointment', 'late'],
    ])
  })
})
