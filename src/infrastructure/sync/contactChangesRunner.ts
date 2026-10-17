import {
  applyRemoteContact,
  findIdentity,
  markRemoteDeleted,
  type IncomingLabels,
} from '@/domain/incomingContacts'
import type {
  ExternalContactsConnection,
  ExternalContactsGateway,
  ExternalContactSnapshot,
  KindyRepository,
} from '@/domain/ports'

/** Where the People API sync token is kept, per Google account. */
export interface SyncTokenStore {
  get(providerAccountId: string): string | undefined
  set(providerAccountId: string, token: string | undefined): void
}

export interface IncomingSyncResult {
  /** Linked people whose Google fields changed. */
  updated: number
  /** Linked people hidden because their contact was deleted in Google. */
  removed: number
  fullRead: boolean
  /** True when there is no connection; the next run catches up. */
  waiting: boolean
}

interface RemoteChanges {
  contacts: ExternalContactSnapshot[]
  deletedResourceNames: string[]
  /** A full read: linked contacts that are missing may have been deleted. */
  complete: boolean
  nextSyncToken?: string
}

/** The native gateway rejects with the HTTP status as code. */
function isGone(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '404' || code === '410'
}

/**
 * A full read leaves out contacts the listing cannot show (one without a
 * name, for example), so each missing linked contact is looked up before it
 * counts as deleted. When in doubt the person stays.
 */
async function confirmDeleted(
  gateway: ExternalContactsGateway,
  resourceNames: string[],
): Promise<string[]> {
  const gone: string[] = []
  for (const resourceName of resourceNames) {
    try {
      await gateway.getContactFields(resourceName)
    } catch (error) {
      if (isGone(error)) gone.push(resourceName)
    }
  }
  return gone
}

async function readAll(gateway: ExternalContactsGateway): Promise<RemoteChanges> {
  const contacts: ExternalContactSnapshot[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  do {
    const page = await gateway.listCandidates(pageToken)
    contacts.push(...page.contacts)
    pageToken = page.nextPageToken
    nextSyncToken = page.nextSyncToken ?? nextSyncToken
  } while (pageToken)
  return { contacts, deletedResourceNames: [], complete: true, nextSyncToken }
}

/** Null when the token expired (Google keeps them about seven days) and a full read is needed. */
async function readChanges(
  gateway: ExternalContactsGateway,
  syncToken: string,
): Promise<RemoteChanges | null> {
  const contacts: ExternalContactSnapshot[] = []
  const deletedResourceNames: string[] = []
  let pageToken: string | undefined
  let nextSyncToken = syncToken
  do {
    const page = await gateway.fetchChanges(syncToken, pageToken)
    if (page.requiresFullRefresh) return null
    contacts.push(...page.contacts)
    deletedResourceNames.push(...page.deletedResourceNames)
    pageToken = page.nextPageToken
    nextSyncToken = page.nextSyncToken || nextSyncToken
  } while (pageToken)
  return { contacts, deletedResourceNames, complete: false, nextSyncToken }
}

/**
 * Brings changes made in Google into Kindy (ADR 0004, section 3). Only people
 * already linked to a contact are updated. The sync token is saved only after
 * the changes are stored, so an interrupted run reads them again.
 */
export async function runIncomingContactSync(deps: {
  repository: Pick<KindyRepository, 'getData' | 'replaceData'>
  gateway: ExternalContactsGateway
  syncTokens: SyncTokenStore
  labels: IncomingLabels
  now?: () => number
  newId?: () => string
}): Promise<IncomingSyncResult> {
  const now = deps.now ?? Date.now
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const idle = { updated: 0, removed: 0, fullRead: false, waiting: false }

  const initial = await deps.repository.getData()
  if (!initial.externalIdentities.some((identity) => identity.provider === 'google')) return idle

  const connection: ExternalContactsConnection | null = await deps.gateway.restore()
  if (!connection) return { ...idle, waiting: true }
  const account = connection.providerAccountId

  const token = deps.syncTokens.get(account)
  const changes =
    (token ? await readChanges(deps.gateway, token) : null) ?? (await readAll(deps.gateway))
  if (changes.complete) {
    const listed = new Set(changes.contacts.map((contact) => contact.resourceName))
    const missing = initial.externalIdentities
      .filter(
        (identity) =>
          identity.provider === 'google' &&
          identity.providerAccountId === account &&
          !identity.remoteDeletedAt &&
          !listed.has(identity.providerResourceId),
      )
      .map((identity) => identity.providerResourceId)
    changes.deletedResourceNames = await confirmDeleted(deps.gateway, missing)
  }

  // Applied to a fresh snapshot, so edits made while Google was read are kept.
  const latest = await deps.repository.getData()
  const at = now()
  let updated = 0
  let removed = 0
  for (const contact of changes.contacts) {
    const identity = findIdentity(latest, account, contact.resourceName)
    if (!identity) continue
    if (applyRemoteContact(latest, identity, contact, { labels: deps.labels, now: at, newId })) {
      updated += 1
    }
  }
  for (const resourceName of changes.deletedResourceNames) {
    const identity = findIdentity(latest, account, resourceName)
    if (!identity || identity.remoteDeletedAt) continue
    markRemoteDeleted(latest, identity, at)
    removed += 1
  }

  if (updated || removed) await deps.repository.replaceData(latest)
  if (changes.nextSyncToken) deps.syncTokens.set(account, changes.nextSyncToken)
  return { updated, removed, fullRead: changes.complete, waiting: false }
}
