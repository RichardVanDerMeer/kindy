import { describe, expect, it } from 'vitest'

import { createConnection } from '@/domain/connections'
import { effectiveEvents, isWeddingDay } from '@/domain/events'
import type { ImportantEvent, Relationship } from '@/domain/model'

const partners: Relationship[] = [createConnection('r', 'richard', 'sophie', 'wife', [])]

function event(id: string, overrides: Partial<ImportantEvent>): ImportantEvent {
  return {
    id,
    type: 'anniversary',
    title: 'anniversary',
    date: { year: 2012, month: 6, day: 8 },
    personIds: ['richard'],
    source: 'google',
    ...overrides,
  }
}

describe('wedding days from Google and Kindy', () => {
  it('reads Google’s anniversary as the wedding day', () => {
    expect(isWeddingDay(event('g', {}))).toBe(true)
    expect(isWeddingDay(event('k', { source: 'kindy' }))).toBe(false)
    expect(effectiveEvents({ events: [event('g', {})], relationships: [] })[0]?.type).toBe(
      'wedding-anniversary',
    )
  })

  it('lets a wedding day entered in Kindy replace the same one from Google', () => {
    const shown = effectiveEvents({
      events: [
        event('google', {}),
        event('kindy', {
          type: 'wedding-anniversary',
          source: 'kindy',
          personIds: ['richard', 'sophie'],
        }),
      ],
      relationships: partners,
    })
    expect(shown.map((item) => item.id)).toEqual(['kindy'])
  })

  it('shows a shared wedding day of partners once, with both names', () => {
    const shown = effectiveEvents({
      events: [event('richard', {}), event('sophie', { personIds: ['sophie'] })],
      relationships: partners,
    })
    expect(shown).toHaveLength(1)
    expect(shown[0]?.personIds.sort()).toEqual(['richard', 'sophie'])
  })

  it('keeps wedding days of people who are not partners apart', () => {
    const shown = effectiveEvents({
      events: [event('a', {}), event('b', { personIds: ['someone-else'] })],
      relationships: partners,
    })
    expect(shown).toHaveLength(2)
  })

  it('leaves other dates alone', () => {
    const custom = event('c', { type: 'custom', source: 'kindy', title: 'Diploma' })
    expect(effectiveEvents({ events: [custom], relationships: [] })).toEqual([custom])
  })
})
