import { describe, expect, it } from 'vitest'

import { closePeople, matchesAudience, type AgendaItem } from '@/domain/agenda'
import { buildComingUpSnapshot } from '@/domain/widget'

const agenda: AgendaItem[] = [
  { id: 'past', kind: 'birthday', date: '2026-09-25', daysFromToday: -2, personIds: ['a'] },
  {
    id: 'emma',
    kind: 'birthday',
    date: '2026-09-27',
    daysFromToday: 0,
    personIds: ['emma'],
    years: 12,
  },
  {
    id: 'dinner',
    kind: 'appointment',
    date: '2026-09-30',
    daysFromToday: 3,
    personIds: ['robin'],
    title: 'Uit eten',
    location: 'De Zwaan',
  },
  {
    id: 'wedding',
    kind: 'wedding-anniversary',
    date: '2026-10-06',
    daysFromToday: 9,
    personIds: [],
  },
  {
    id: 'finished',
    kind: 'reminder',
    date: '2026-09-28',
    daysFromToday: 1,
    personIds: [],
    title: 'Al gedaan',
    done: true,
  },
]

function build(filters: AgendaItem['kind'][] | [], hideNames: boolean) {
  return buildComingUpSnapshot(agenda, {
    preferences: { filters: filters as never, hideNames, audience: 'everyone' },
    hideNames,
    describe: (item) => ({
      title: `${item.id} title`,
      detail: `${item.id} detail`,
      personId: item.personIds[0],
    }),
    genericTitle: (filter) => `generic ${filter}`,
    heading: 'Binnenkort',
    empty: 'Niets',
    labels: { today: 'Vandaag', tomorrow: 'Morgen' },
    locale: 'nl',
    now: 1,
  })
}

describe('coming up widget snapshot', () => {
  it('shows upcoming items only, in order', () => {
    expect(build([], false).items.map((item) => item.title)).toEqual([
      'emma title',
      'dinner title',
      'wedding title',
    ])
  })

  it('shows only the chosen kinds', () => {
    const snapshot = build(['birthday', 'appointment'] as never, false)
    expect(snapshot.items.map((item) => item.kind)).toEqual(['birthday', 'appointment'])
  })

  it('never puts names or places on the home screen when names are hidden', () => {
    const snapshot = build([], true)
    expect(snapshot.items).toEqual([
      {
        date: '2026-09-27',
        title: 'generic birthday',
        kind: 'birthday',
        kindLabel: 'generic birthday',
        personId: 'emma',
      },
      {
        date: '2026-09-30',
        title: 'generic appointment',
        kind: 'appointment',
        kindLabel: 'generic appointment',
        personId: 'robin',
      },
      {
        date: '2026-10-06',
        title: 'generic wedding',
        kind: 'wedding',
        kindLabel: 'generic wedding',
        personId: undefined,
      },
    ])
    expect(JSON.stringify(snapshot)).not.toMatch(/ title| detail|Zwaan/)
  })
})

describe('widget links', () => {
  it('opens only known places in Kindy', async () => {
    const { routeForDeepLink } = await import('@/router/deepLinks')
    expect(routeForDeepLink('kindy://people/demo-emma')).toBe('/people/demo-emma')
    expect(routeForDeepLink('kindy://upcoming')).toBe('/upcoming')
    expect(routeForDeepLink('kindy://settings')).toBeNull()
    expect(routeForDeepLink('kindy://people/../settings')).toBeNull()
    expect(routeForDeepLink('https://evil.example/people/x')).toBeNull()
    expect(routeForDeepLink('not a url')).toBeNull()
  })
})

describe('close people', () => {
  const close = new Set(['me', 'emma'])
  const item = (kind: AgendaItem['kind'], personIds: string[]): AgendaItem => ({
    id: `${kind}-${personIds.join()}`,
    kind,
    date: '2026-10-20',
    daysFromToday: 2,
    personIds,
  })

  it('shows birthdays of close people only', () => {
    expect(matchesAudience(item('birthday', ['emma']), 'close', close)).toBe(true)
    expect(matchesAudience(item('birthday', ['plumber']), 'close', close)).toBe(false)
    expect(matchesAudience(item('birthday', ['plumber']), 'everyone', close)).toBe(true)
  })

  it('always shows appointments and memos', () => {
    expect(matchesAudience(item('appointment', ['plumber']), 'close', close)).toBe(true)
    expect(matchesAudience(item('reminder', []), 'close', close)).toBe(true)
  })

  it('shows everyone until someone is marked close', () => {
    expect(matchesAudience(item('birthday', ['plumber']), 'close', new Set(['me']))).toBe(true)
  })

  it('counts favourites, circle members and the user’s own connections as close', () => {
    const base = {
      isArchived: false,
      isDeceased: false,
      contactPoints: [],
      details: [],
      createdAt: 0,
      updatedAt: 0,
    }
    const result = closePeople({
      people: [
        { ...base, id: 'me', displayName: 'Me', isSelf: true, isFavorite: false },
        { ...base, id: 'fav', displayName: 'Fav', isFavorite: true },
        { ...base, id: 'club', displayName: 'Club', isFavorite: false },
        { ...base, id: 'kid', displayName: 'Kid', isFavorite: false },
        { ...base, id: 'plumber', displayName: 'Plumber', isFavorite: false },
      ],
      memberships: [{ circleId: 'c', personId: 'club' }],
      relationships: [{ id: 'r', fromPersonId: 'me', toPersonId: 'kid', type: 'parent-of' }],
    })
    expect([...result].sort()).toEqual(['club', 'fav', 'kid', 'me'])
  })
})
