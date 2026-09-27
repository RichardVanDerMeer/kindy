import { describe, expect, it } from 'vitest'

import type { AgendaItem } from '@/domain/agenda'
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
]

function build(filters: AgendaItem['kind'][] | [], hideNames: boolean) {
  return buildComingUpSnapshot(agenda, {
    preferences: { filters: filters as never, hideNames },
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
      { date: '2026-09-27', title: 'generic birthday', kind: 'birthday', personId: 'emma' },
      { date: '2026-09-30', title: 'generic appointment', kind: 'appointment', personId: 'robin' },
      { date: '2026-10-06', title: 'generic wedding', kind: 'wedding', personId: undefined },
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
