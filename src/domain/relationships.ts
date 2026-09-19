import type { Relationship, RelationshipType } from './model'

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

export function relationshipTypeForPerson(
  relationship: Relationship,
  personId: string,
): RelationshipType {
  if (relationship.fromPersonId === personId) return relationship.type
  if (relationship.toPersonId === personId) return inverseRelationship(relationship.type)
  throw new Error('The person is not part of this relationship')
}

export function connectedPersonId(relationship: Relationship, personId: string): string {
  if (relationship.fromPersonId === personId) return relationship.toPersonId
  if (relationship.toPersonId === personId) return relationship.fromPersonId
  throw new Error('The person is not part of this relationship')
}
