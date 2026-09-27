import type { EntityId, Relationship, RelationshipRole, RelationshipType } from './model'
import { assertRelationshipParticipants, relationshipTypeForPerson } from './relationships'

export type RoleGroup = 'family' | 'friends'

/** Roles a user can pick, phrased from the profile being edited: "<other> is my <role>". */
export const connectionRoles: Array<{ group: RoleGroup; roles: RelationshipRole[] }> = [
  {
    group: 'family',
    roles: [
      'father',
      'mother',
      'parent',
      'husband',
      'wife',
      'partner',
      'son',
      'daughter',
      'child',
      'brother',
      'sister',
      'sibling',
    ],
  },
  { group: 'friends', roles: ['best-friend', 'friend'] },
]

type Gender = 'male' | 'female' | null

const roleGender: Partial<Record<RelationshipRole, Exclude<Gender, null>>> = {
  father: 'male',
  son: 'male',
  husband: 'male',
  brother: 'male',
  mother: 'female',
  daughter: 'female',
  wife: 'female',
  sister: 'female',
}

/**
 * Kindy does not ask for gender. When other relationships already describe a
 * person with a gendered role (for example "father"), reuse that for the
 * reciprocal label; otherwise fall back to a neutral role.
 */
export function inferGender(personId: EntityId, relationships: Relationship[]): Gender {
  for (const relationship of relationships) {
    const role =
      relationship.toPersonId === personId
        ? relationship.fromPersonRole
        : relationship.fromPersonId === personId
          ? relationship.toPersonRole
          : undefined
    const gender = role ? roleGender[role] : undefined
    if (gender) return gender
  }
  return null
}

function gendered(
  gender: Gender,
  male: RelationshipRole,
  female: RelationshipRole,
  neutral: RelationshipRole,
) {
  if (gender === 'male') return male
  if (gender === 'female') return female
  return neutral
}

/** Canonical relationship type from the subject's perspective for a chosen role. */
export function relationshipTypeForRole(role: RelationshipRole): RelationshipType {
  switch (role) {
    case 'father':
    case 'mother':
    case 'parent':
      return 'child-of'
    case 'son':
    case 'daughter':
    case 'child':
      return 'parent-of'
    case 'husband':
    case 'wife':
    case 'spouse':
    case 'partner':
      return 'partner-of'
    case 'brother':
    case 'sister':
    case 'sibling':
      return 'sibling-of'
    case 'best-friend':
    case 'friend':
      return 'friend-of'
  }
}

function reciprocalRole(role: RelationshipRole, subjectGender: Gender): RelationshipRole {
  switch (relationshipTypeForRole(role)) {
    case 'child-of':
      return gendered(subjectGender, 'son', 'daughter', 'child')
    case 'parent-of':
      return gendered(subjectGender, 'father', 'mother', 'parent')
    case 'partner-of':
      return role === 'partner' ? 'partner' : gendered(subjectGender, 'husband', 'wife', 'spouse')
    case 'sibling-of':
      return gendered(subjectGender, 'brother', 'sister', 'sibling')
    default:
      return role
  }
}

/**
 * Creates one canonical relationship for "<otherId> is <subjectId>'s <role>".
 * Parent links are always stored as parent-of from the parent, so a family
 * tree can be derived from a single direction.
 */
export function createConnection(
  id: EntityId,
  subjectId: EntityId,
  otherId: EntityId,
  role: RelationshipRole,
  existing: Relationship[],
): Relationship {
  assertRelationshipParticipants(subjectId, otherId)
  const type = relationshipTypeForRole(role)
  const duplicate = existing.some(
    (relationship) =>
      !relationship.endedOn &&
      ((relationship.fromPersonId === subjectId && relationship.toPersonId === otherId) ||
        (relationship.fromPersonId === otherId && relationship.toPersonId === subjectId)) &&
      relationshipTypeForPerson(relationship, subjectId) === type,
  )
  if (duplicate) throw new Error('This connection already exists')

  const back = reciprocalRole(role, inferGender(subjectId, existing))
  if (type === 'child-of') {
    return {
      id,
      fromPersonId: otherId,
      toPersonId: subjectId,
      type: 'parent-of',
      fromPersonRole: back,
      toPersonRole: role,
    }
  }
  return {
    id,
    fromPersonId: subjectId,
    toPersonId: otherId,
    type,
    fromPersonRole: role,
    toPersonRole: back,
  }
}

/** The role and free label the given person sees for this relationship. */
export function relationshipViewFor(relationship: Relationship, personId: EntityId) {
  const isFrom = relationship.fromPersonId === personId
  return {
    type: relationshipTypeForPerson(relationship, personId),
    role: isFrom ? relationship.fromPersonRole : relationship.toPersonRole,
    label:
      (isFrom ? relationship.fromPersonLabel : relationship.toPersonLabel) ??
      relationship.customLabel,
  }
}

/**
 * Siblings stored explicitly plus people who share at least one parent with
 * the subject. The latter are derived, so the family tree stays consistent.
 */
export function siblingIds(personId: EntityId, relationships: Relationship[]): EntityId[] {
  const active = relationships.filter((relationship) => !relationship.endedOn)
  const parents = active
    .filter(
      (relationship) => relationship.type === 'parent-of' && relationship.toPersonId === personId,
    )
    .map((relationship) => relationship.fromPersonId)
  const viaParents = active
    .filter(
      (relationship) =>
        relationship.type === 'parent-of' &&
        parents.includes(relationship.fromPersonId) &&
        relationship.toPersonId !== personId,
    )
    .map((relationship) => relationship.toPersonId)
  const explicit = active
    .filter(
      (relationship) =>
        relationship.type === 'sibling-of' &&
        (relationship.fromPersonId === personId || relationship.toPersonId === personId),
    )
    .map((relationship) =>
      relationship.fromPersonId === personId ? relationship.toPersonId : relationship.fromPersonId,
    )
  return [...new Set([...explicit, ...viaParents])]
}
