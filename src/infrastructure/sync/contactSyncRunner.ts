import {
  fieldsToWrite,
  managedContactFields,
  planContactUpdate,
  uploadablePhoto,
  writtenAfterSync,
} from '@/domain/contactSync'
import type { ExternalIdentity, KindyData, Person, SyncOperation } from '@/domain/model'
import type { ExternalContactsGateway, KindyRepository } from '@/domain/ports'

export interface ContactSyncResult {
  done: number
  failed: number
  /** True when there is work but no connection; it stays queued. */
  waiting: boolean
}

type Outcome =
  | { operation: SyncOperation; ok: true; identity?: ExternalIdentity }
  | { operation: SyncOperation; ok: false; error: string }

function linkedIdentity(data: KindyData, personId: string): ExternalIdentity | undefined {
  return data.externalIdentities.find(
    (identity) =>
      identity.personId === personId && identity.provider === 'google' && !identity.remoteDeletedAt,
  )
}

function values(person: Person, kind: 'phone' | 'email'): string[] {
  return person.contactPoints.filter((point) => point.kind === kind).map((point) => point.value)
}

/** Error text that is safe to store: never a response body or contact details. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 160) : 'Unknown error'
}

/**
 * Sends queued changes to the linked address book. Kindy data is read once,
 * each operation is sent, and the outcome is applied to a fresh snapshot so
 * edits made while syncing are kept and re-queued work is not dropped.
 */
export async function runContactSync(deps: {
  repository: Pick<KindyRepository, 'getData' | 'replaceData'>
  gateway: ExternalContactsGateway
  labels: { death: string }
  /** With write-back off, only explicit "save in Google" requests run. */
  onlyCreates?: boolean
  now?: () => number
  newId?: () => string
}): Promise<ContactSyncResult> {
  const now = deps.now ?? Date.now
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const snapshot = await deps.repository.getData()
  const queue = snapshot.syncQueue.filter(
    (operation) => !deps.onlyCreates || operation.kind === 'create',
  )
  if (!queue.length) return { done: 0, failed: 0, waiting: false }

  const connection = await deps.gateway.restore()
  if (!connection) return { done: 0, failed: 0, waiting: true }

  const outcomes: Outcome[] = []
  for (const operation of queue) {
    try {
      const person = snapshot.people.find((candidate) => candidate.id === operation.personId)
      if (!person || person.deletedAt) {
        outcomes.push({ operation, ok: true })
        continue
      }
      const current = managedContactFields(person.id, snapshot, deps.labels)
      const identity = linkedIdentity(snapshot, person.id)
      const fields = fieldsToWrite(
        identity ? { ...operation, kind: 'update' } : operation,
        person.syncExclusions ?? [],
      )
      const photo = fields.includes('photo') ? uploadablePhoto(person.photoRef) : undefined

      if (!identity && operation.kind === 'create') {
        const created = await deps.gateway.createContact({
          givenName: person.givenName ?? person.displayName,
          familyName: person.familyName,
          birthday: fields.includes('birthday') ? current.birthday : null,
          events: fields.includes('events') ? current.events : [],
          phones: fields.includes('phones') ? values(person, 'phone') : [],
          emails: fields.includes('emails') ? values(person, 'email') : [],
        })
        if (photo) await deps.gateway.updateContactPhoto(created.resourceName, photo)
        outcomes.push({
          operation,
          ok: true,
          identity: {
            id: newId(),
            personId: person.id,
            provider: 'google',
            providerAccountId: connection.providerAccountId,
            providerResourceId: created.resourceName,
            etag: created.etag,
            lastSyncedAt: now(),
            writtenFields: writtenAfterSync(undefined, current, fields),
          },
        })
        continue
      }
      if (!identity) {
        outcomes.push({ operation, ok: true })
        continue
      }
      // Contact ids belong to one Google account: never write them with another account's access.
      if (identity.providerAccountId !== connection.providerAccountId) {
        outcomes.push({ operation, ok: false, error: 'Linked to another Google account' })
        continue
      }

      const remote = await deps.gateway.getContactFields(identity.providerResourceId)
      const plan = planContactUpdate(remote, identity.writtenFields, current, fields)
      let etag = plan
        ? (await deps.gateway.updateContactFields(identity.providerResourceId, remote.etag, plan))
            .etag
        : remote.etag
      if (photo && current.photoHash !== identity.writtenFields?.photoHash) {
        etag = (await deps.gateway.updateContactPhoto(identity.providerResourceId, photo)).etag
      }
      outcomes.push({
        operation,
        ok: true,
        identity: {
          ...identity,
          etag,
          lastSyncedAt: now(),
          writtenFields: writtenAfterSync(identity.writtenFields, current, fields),
        },
      })
    } catch (error) {
      outcomes.push({ operation, ok: false, error: describe(error) })
    }
  }

  const latest = await deps.repository.getData()
  for (const outcome of outcomes) {
    const queued = latest.syncQueue.find((candidate) => candidate.id === outcome.operation.id)
    if (outcome.ok) {
      if (outcome.identity) {
        const index = latest.externalIdentities.findIndex(
          (identity) => identity.id === outcome.identity?.id,
        )
        if (index === -1) latest.externalIdentities.push(outcome.identity)
        else latest.externalIdentities[index] = outcome.identity
      }
      // Re-queued while syncing: keep it so the newer values are sent too.
      if (queued && queued.updatedAt === outcome.operation.updatedAt) {
        latest.syncQueue = latest.syncQueue.filter((candidate) => candidate !== queued)
      }
    } else if (queued) {
      queued.state = 'failed'
      queued.attempts += 1
      queued.lastError = outcome.error
    }
  }
  await deps.repository.replaceData(latest)

  const failed = outcomes.filter((outcome) => !outcome.ok).length
  return { done: outcomes.length - failed, failed, waiting: false }
}
