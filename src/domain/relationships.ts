import type { RelationshipType } from './model'

const inverseTypes: Record<RelationshipType, RelationshipType> = {
  'parent-of': 'child-of',
  'child-of': 'parent-of',
  'partner-of': 'partner-of',
  'sibling-of': 'sibling-of',
  'friend-of': 'friend-of',
  'colleague-of': 'colleague-of',
  'introduced-by': 'introduced',
  introduced: 'introduced-by',
  custom: 'custom',
}

export function inverseRelationship(type: RelationshipType): RelationshipType {
  return inverseTypes[type]
}

export function assertRelationshipParticipants(fromPersonId: string, toPersonId: string): void {
  if (fromPersonId === toPersonId) {
    throw new Error('A person cannot have a relationship with themselves')
  }
}
