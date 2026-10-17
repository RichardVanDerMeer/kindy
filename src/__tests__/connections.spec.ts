import { describe, expect, it } from 'vitest'

import {
  childrenOf,
  connectionRoleGroups,
  createConnection,
  isChildRole,
  partnerChildSuggestions,
  partnerIds,
} from '@/domain/connections'
import type { Relationship } from '@/domain/model'

/** Anna and Bas are partners; Bas has Cas and Dirk; Anna already has Cas. */
function family(): Relationship[] {
  const relationships: Relationship[] = []
  const add = (subject: string, other: string, role: Parameters<typeof createConnection>[3]) =>
    relationships.push(
      createConnection(`r${relationships.length}`, subject, other, role, relationships),
    )
  add('anna', 'bas', 'husband')
  add('bas', 'cas', 'son')
  add('bas', 'dirk', 'daughter')
  add('anna', 'cas', 'son')
  return relationships
}

describe('connection helpers', () => {
  it('groups every role once, as the picker shows them', () => {
    const roles = connectionRoleGroups.flatMap((group) => group.roles)
    expect(new Set(roles).size).toBe(roles.length)
    expect(connectionRoleGroups.find((group) => group.group === 'parent')?.roles).toEqual([
      'father',
      'mother',
      'parent',
    ])
  })

  it('knows children roles', () => {
    expect(isChildRole('daughter')).toBe(true)
    expect(isChildRole('mother')).toBe(false)
  })

  it('finds partners in both directions', () => {
    expect(partnerIds('anna', family())).toEqual(['bas'])
    expect(partnerIds('bas', family())).toEqual(['anna'])
  })

  it('lists a person’s children with the role the parent sees', () => {
    expect(childrenOf('bas', family())).toEqual([
      { personId: 'cas', role: 'son' },
      { personId: 'dirk', role: 'daughter' },
    ])
  })

  it('suggests the partner’s children who are not yet the person’s children', () => {
    expect(partnerChildSuggestions('anna', family())).toEqual([
      { personId: 'dirk', role: 'daughter', viaPartnerId: 'bas' },
    ])
  })

  it('suggests nothing without a partner', () => {
    expect(partnerChildSuggestions('cas', family())).toEqual([])
  })
})
