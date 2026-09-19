import { describe, expect, it } from 'vitest'

import { isValidPartialDate, nextPartialDate } from '@/domain/dates'
import { scoreDuplicate } from '@/domain/duplicates'
import type { Person } from '@/domain/model'
import { nextOccurrence } from '@/domain/reminders'
import { assertRelationshipParticipants, inverseRelationship } from '@/domain/relationships'

function person(overrides: Partial<Person>): Person {
  return {
    id: crypto.randomUUID(),
    displayName: 'Sample Person',
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

describe('relationships', () => {
  it('derives reciprocal relationship types', () => {
    expect(inverseRelationship('parent-of')).toBe('child-of')
    expect(inverseRelationship('partner-of')).toBe('partner-of')
    expect(inverseRelationship('introduced-by')).toBe('introduced')
  })

  it('rejects self relationships', () => {
    expect(() => assertRelationshipParticipants('same', 'same')).toThrow(/themselves/)
  })
})

describe('partial dates', () => {
  it('supports a leap day without inventing a stored year', () => {
    expect(isValidPartialDate({ year: null, month: 2, day: 29 })).toBe(true)
    expect(isValidPartialDate({ year: 2025, month: 2, day: 29 })).toBe(false)
  })

  it('rolls an annual date into the next year', () => {
    const next = nextPartialDate(
      { year: null, month: 1, day: 5 },
      new Date('2026-09-19T12:00:00Z'),
    )
    expect(next.toISOString()).toBe('2027-01-05T09:00:00.000Z')
  })
})

describe('duplicate scoring', () => {
  it('treats an exact normalized phone as a strong candidate', () => {
    const left = person({
      displayName: 'Alex Morgan',
      contactPoints: [
        {
          id: 'phone-a',
          kind: 'phone',
          label: 'mobile',
          value: '+31 6 1234',
          normalizedValue: '+3161234',
          isPrimary: true,
          source: 'kindy',
        },
      ],
    })
    const right = person({
      displayName: 'A. Morgan',
      contactPoints: [
        {
          id: 'phone-b',
          kind: 'phone',
          label: 'mobile',
          value: '06 1234',
          normalizedValue: '+3161234',
          isPrimary: true,
          source: 'google',
        },
      ],
    })
    expect(scoreDuplicate(left, right).score).toBe(100)
  })
})

describe('reminder recurrence', () => {
  it('preserves local wall-clock time over daylight-saving changes', () => {
    const result = nextOccurrence(
      '2026-03-28T09:00:00',
      'Europe/Amsterdam',
      { kind: 'daily', interval: 1 },
      Date.parse('2026-03-28T10:00:00Z'),
    )
    expect(new Date(result ?? 0).toISOString()).toBe('2026-03-29T07:00:00.000Z')
  })
})
