import { importedContactDates, managedContactFields, writtenAfterSync } from './contactSync'
import type {
  ContactPoint,
  EntityId,
  ExternalIdentity,
  KindyData,
  PartialDate,
  SyncField,
} from './model'
import type { ExternalContactSnapshot } from './ports'

/** Google fields Kindy keeps a local copy of, grouped as the outgoing sync groups them. */
const incomingFields: SyncField[] = ['name', 'phones', 'emails', 'birthday', 'events']

/**
 * Contact points Kindy does not write to Google yet. Values added in Kindy
 * stay next to Google's until the outgoing sync can store them there.
 */
const kindyKeptKinds: ContactPoint['kind'][] = ['address', 'url']

export interface IncomingLabels {
  /** The death label in the current language, as the outgoing sync writes it. */
  death: string
  /** Death labels in every supported language, to recognise one written elsewhere. */
  deathLabels: string[]
}

export function findIdentity(
  data: KindyData,
  providerAccountId: string,
  resourceName: string,
): ExternalIdentity | undefined {
  return data.externalIdentities.find(
    (identity) =>
      identity.provider === 'google' &&
      identity.providerAccountId === providerAccountId &&
      identity.providerResourceId === resourceName,
  )
}

/**
 * Fields Google may not overwrite: changes still waiting in the sync queue,
 * and fields the user keeps in Kindy only.
 */
function protectedFields(data: KindyData, personId: EntityId): Set<SyncField> {
  const person = data.people.find((candidate) => candidate.id === personId)
  const fields = new Set<SyncField>(person?.syncExclusions ?? [])
  for (const operation of data.syncQueue) {
    if (operation.personId !== personId) continue
    for (const field of operation.fields ?? incomingFields) fields.add(field)
  }
  return fields
}

function samePartialDate(left: PartialDate, right: PartialDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day
}

function mergedPoints(
  existing: ContactPoint[],
  snapshot: ExternalContactSnapshot,
  kinds: ContactPoint['kind'][],
  newId: () => string,
): ContactPoint[] {
  return kinds.flatMap((kind) => {
    const local = existing.filter((point) => point.kind === kind)
    const remote = snapshot.contactPoints
      .filter((point) => point.kind === kind)
      .map((point, index): ContactPoint => {
        const match = local.find((candidate) => candidate.value === point.value)
        return {
          id: match?.id ?? newId(),
          kind,
          label: point.label,
          value: point.value,
          normalizedValue: point.value.trim().toLocaleLowerCase(),
          isPrimary: index === 0,
          source: 'google',
          sourceFieldId: point.providerFieldId,
        }
      })
    if (!kindyKeptKinds.includes(kind)) return remote
    const kept = local.filter(
      (point) =>
        point.source === 'kindy' && !remote.some((candidate) => candidate.value === point.value),
    )
    return [...remote, ...kept.map((point) => ({ ...point, isPrimary: false }))]
  })
}

/**
 * Replaces the local copy of a linked person's Google fields with the
 * contact's current values. Kindy's own data (circles, notes, ...) is not
 * touched. Returns false when nothing was applied because the contact has
 * not changed since Kindy last saw it.
 */
export function applyRemoteContact(
  data: KindyData,
  identity: ExternalIdentity,
  snapshot: ExternalContactSnapshot,
  options: { labels: IncomingLabels; now: number; newId: () => string },
): boolean {
  const person = data.people.find((candidate) => candidate.id === identity.personId)
  if (!person) return false
  const restored = Boolean(identity.remoteDeletedAt)
  if (restored) {
    // Undone in Google: the same contact is back, so the person is shown again.
    if (person.deletedAt === identity.remoteDeletedAt) delete person.deletedAt
    delete identity.remoteDeletedAt
  }
  if (!restored && snapshot.etag && snapshot.etag === identity.etag) return false

  const blocked = protectedFields(data, person.id)
  const applied = incomingFields.filter((field) => !blocked.has(field))
  const dates = importedContactDates(snapshot.birthday, snapshot.events, options.labels.deathLabels)
  const written = identity.writtenFields

  if (applied.includes('name')) {
    person.displayName = snapshot.displayName
    person.givenName = snapshot.givenName
    person.familyName = snapshot.familyName
  }

  const pointKinds: ContactPoint['kind'][] = [
    ...(applied.includes('phones') ? (['phone'] as const) : []),
    ...(applied.includes('emails') ? (['email'] as const) : []),
    ...kindyKeptKinds,
  ]
  person.contactPoints = [
    ...person.contactPoints.filter((point) => !pointKinds.includes(point.kind)),
    ...mergedPoints(person.contactPoints, snapshot, pointKinds, options.newId),
  ]

  if (applied.includes('birthday')) {
    // Without one in Google, clear only a birthday that was there before:
    // a birthday added in Kindy and never sent stays.
    if (dates.birthDate || written?.birthday) person.birthDate = dates.birthDate
  }

  if (applied.includes('events')) {
    const deathWasInGoogle = written?.events.some((event) =>
      options.labels.deathLabels.some(
        (label) => label.toLocaleLowerCase() === event.type.toLocaleLowerCase(),
      ),
    )
    if (dates.deathDate) {
      person.isDeceased = true
      person.deathDate = dates.deathDate
      person.isFavorite = false
    } else if (deathWasInGoogle) {
      person.isDeceased = false
      person.deathDate = undefined
    }

    // Anniversaries read from Google are replaced; wedding days kept in Kindy
    // are written to Google as anniversaries, so those are not added twice.
    data.events = data.events.filter(
      (event) =>
        !(
          event.source === 'google' &&
          event.externalSourceRef === identity.providerResourceId &&
          event.type === 'anniversary'
        ),
    )
    const ownDates = data.events
      .filter(
        (event) =>
          event.personIds.includes(person.id) &&
          (event.type === 'anniversary' || event.type === 'wedding-anniversary'),
      )
      .map((event) => event.date)
    for (const date of dates.anniversaries) {
      if (ownDates.some((own) => samePartialDate(own, date))) continue
      data.events.push({
        id: options.newId(),
        type: 'anniversary',
        title: 'anniversary',
        date,
        personIds: [person.id],
        source: 'google',
        externalSourceRef: identity.providerResourceId,
      })
    }
  }

  person.updatedAt = options.now
  identity.etag = snapshot.etag
  identity.lastSyncedAt = options.now
  // Google's values are now the local copy: a later change in Kindy replaces
  // them instead of adding a second value.
  identity.writtenFields = writtenAfterSync(
    written,
    managedContactFields(person.id, data, options.labels),
    applied,
  )
  return true
}

/** Hides a person whose contact was deleted in Google; their Kindy data is kept. */
export function markRemoteDeleted(data: KindyData, identity: ExternalIdentity, now: number): void {
  if (identity.remoteDeletedAt) return
  identity.remoteDeletedAt = now
  const person = data.people.find((candidate) => candidate.id === identity.personId)
  if (person && !person.deletedAt) person.deletedAt = now
}
