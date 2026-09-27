import { describe, expect, it } from 'vitest'

import { agendaFilterFor, buildAgenda } from '@/domain/agenda'
import { circleAvatarStack } from '@/domain/circles'
import { createConnection, inferGender, siblingIds } from '@/domain/connections'
import type { KindyData, Person, Relationship } from '@/domain/model'
import { personTimeline } from '@/domain/timeline'

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    displayName: id,
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

function data(overrides: Partial<KindyData>): KindyData {
  return {
    schemaVersion: 4,
    people: [],
    externalIdentities: [],
    circles: [],
    memberships: [],
    relationships: [],
    notes: [],
    events: [],
    reminders: [],
    reminderOccurrences: [],
    interactions: [],
    ...overrides,
  }
}

describe('connections', () => {
  it('stores a chosen parent as one canonical parent-of link from the parent', () => {
    const relationship = createConnection('r1', 'emma', 'richard', 'father', [])
    expect(relationship).toMatchObject({
      fromPersonId: 'richard',
      toPersonId: 'emma',
      type: 'parent-of',
      toPersonRole: 'father',
      fromPersonRole: 'child',
    })
  })

  it('uses a gendered reciprocal role once other links reveal it', () => {
    const existing: Relationship[] = [createConnection('r1', 'emma', 'richard', 'father', [])]
    expect(inferGender('richard', existing)).toBe('male')
    const toHenk = createConnection('r2', 'richard', 'henk', 'father', existing)
    expect(toHenk.fromPersonRole).toBe('son')
  })

  it('refuses duplicate connections and self connections', () => {
    const existing = [createConnection('r1', 'richard', 'robin', 'best-friend', [])]
    expect(() => createConnection('r2', 'robin', 'richard', 'friend', existing)).toThrow(/exists/)
    expect(() => createConnection('r3', 'richard', 'richard', 'friend', [])).toThrow(/themselves/)
  })

  it('derives siblings from shared parents', () => {
    const relationships = [
      createConnection('r1', 'emma', 'richard', 'father', []),
      createConnection('r2', 'lucas', 'richard', 'father', []),
    ]
    expect(siblingIds('emma', relationships)).toEqual(['lucas'])
  })
})

describe('agenda', () => {
  const today = { year: 2026, month: 9, day: 27 }

  it('shows birthdays today with the new age and memorials for deceased people', () => {
    const agenda = buildAgenda(
      data({
        people: [
          person('emma', { birthDate: { year: 2014, month: 9, day: 27 } }),
          person('henk', {
            isDeceased: true,
            birthDate: { year: 1948, month: 10, day: 3 },
            deathDate: { year: 2024, month: 9, day: 25 },
          }),
        ],
      }),
      today,
      { daysBack: 7, daysAhead: 30 },
    )

    expect(agenda.map((item) => [item.kind, item.daysFromToday, item.years])).toEqual([
      ['memorial-death', -2, 2],
      ['birthday', 0, 12],
      ['memorial-birth', 6, 78],
    ])
    expect(agenda.map((item) => agendaFilterFor(item.kind))).toEqual([
      'memorial',
      'birthday',
      'memorial',
    ])
  })

  it('wraps around the new year and skips leap days in other years', () => {
    const agenda = buildAgenda(
      data({
        people: [
          person('newyear', { birthDate: { year: null, month: 1, day: 2 } }),
          person('leap', { birthDate: { year: null, month: 2, day: 29 } }),
        ],
      }),
      { year: 2026, month: 12, day: 30 },
      { daysBack: 0, daysAhead: 70 },
    )
    expect(agenda.map((item) => [item.personIds[0], item.date])).toEqual([
      ['newyear', '2027-01-02'],
    ])
  })

  it('does not repeat a birthday that also exists as an event', () => {
    const agenda = buildAgenda(
      data({
        people: [person('sophie', { birthDate: { year: 1986, month: 10, day: 1 } })],
        events: [
          {
            id: 'e1',
            type: 'birthday',
            title: 'Verjaardag',
            date: { year: 1986, month: 10, day: 1 },
            personIds: ['sophie'],
            source: 'google',
          },
        ],
      }),
      today,
      { daysBack: 0, daysAhead: 30 },
    )
    expect(agenda).toHaveLength(1)
  })
})

describe('circle avatar stack', () => {
  it('shows favourites first and turns the last slot into a counter', () => {
    const members = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) =>
      person(id, { isFavorite: id === 'h' }),
    )
    const stack = circleAvatarStack(members, 6)
    expect(stack.shown.map((member) => member.id)).toEqual(['h', 'a', 'b', 'c', 'd'])
    expect(stack.overflow).toBe(3)
  })

  it('shows everyone when they fit', () => {
    const stack = circleAvatarStack([person('a'), person('b')], 6)
    expect(stack).toMatchObject({ overflow: 0 })
    expect(stack.shown).toHaveLength(2)
  })
})

describe('person timeline', () => {
  it('orders life events newest first and keeps dates without a year apart', () => {
    const timeline = personTimeline(
      'henk',
      data({
        people: [
          person('henk', {
            isDeceased: true,
            birthDate: { year: 1948, month: 2, day: 3 },
            deathDate: { year: 2024, month: 5, day: 14 },
          }),
          person('els'),
        ],
        events: [
          {
            id: 'wedding',
            type: 'wedding-anniversary',
            title: 'Trouwdag',
            date: { year: 1975, month: 6, day: 12 },
            personIds: ['henk', 'els'],
            source: 'kindy',
          },
          {
            id: 'club',
            type: 'anniversary',
            title: 'Lid van de club',
            date: { year: null, month: 9, day: 1 },
            personIds: ['henk'],
            source: 'kindy',
          },
        ],
      }),
    )

    expect(timeline.dated.map((entry) => entry.kind)).toEqual(['died', 'married', 'born'])
    expect(timeline.dated[1]?.otherPersonIds).toEqual(['els'])
    expect(timeline.undated.map((entry) => entry.kind)).toEqual(['anniversary'])
  })
})
