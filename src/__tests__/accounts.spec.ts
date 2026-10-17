import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KINDY_SCHEMA_VERSION, type KindyData } from '@/domain/model'
import {
  BrowserKindyRepository,
  STORAGE_KEY,
} from '@/infrastructure/repositories/BrowserKindyRepository'
import {
  accountStoreKey,
  belongsToAccount,
  openKindyRepository,
} from '@/infrastructure/repositories/repository'

function data(accountIds: string[]): KindyData {
  return {
    schemaVersion: KINDY_SCHEMA_VERSION,
    people: accountIds.map((_, index) => ({
      id: `person-${index}`,
      displayName: `Person ${index}`,
      isFavorite: false,
      isArchived: false,
      isDeceased: false,
      contactPoints: [],
      details: [],
      createdAt: 1,
      updatedAt: 1,
    })),
    externalIdentities: accountIds.map((providerAccountId, index) => ({
      id: `identity-${index}`,
      personId: `person-${index}`,
      provider: 'google' as const,
      providerAccountId,
      providerResourceId: `people/c${index}`,
    })),
    circles: [],
    memberships: [],
    relationships: [],
    notes: [],
    events: [],
    reminders: [],
    reminderOccurrences: [],
    interactions: [],
    syncQueue: [],
    wishes: [],
    calendarLinks: [],
  }
}

const accountA = { id: 'account-a', email: 'a@example.test' }
const accountB = { id: 'account-b', email: 'b@example.test' }

async function storedFor(accountId: string): Promise<KindyData | null> {
  const raw = localStorage.getItem(`${STORAGE_KEY}.${await accountStoreKey(accountId)}`)
  return raw ? (JSON.parse(raw) as KindyData) : null
}

/** An in-memory local storage; the test runtime does not provide a usable one. */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

describe('Kindy data per Google account (ADR 0005)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))

  it('gives each account its own store, without the account id in its name', async () => {
    const keyA = await accountStoreKey(accountA.id)
    expect(keyA).toMatch(/^[0-9a-f]{16}$/)
    expect(keyA).not.toBe(await accountStoreKey(accountB.id))
    expect(keyA).toBe(await accountStoreKey(accountA.id))
  })

  it('only hands old data to the account its contacts belong to', () => {
    expect(belongsToAccount(data([]), accountA.id)).toBe(true)
    expect(belongsToAccount(data([accountA.id, accountA.id]), accountA.id)).toBe(true)
    expect(belongsToAccount(data([accountA.id, accountB.id]), accountA.id)).toBe(false)
  })

  it('moves the single store from before to the account it belongs to', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data([accountA.id])))

    const repository = await openKindyRepository(accountA)
    await repository.initialize()

    expect((await repository.getData()).people).toHaveLength(1)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect((await storedFor(accountA.id))?.people).toHaveLength(1)
  })

  it('leaves another account’s old data alone and starts empty', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data([accountA.id])))

    const repository = await openKindyRepository(accountB)
    await repository.initialize()

    expect((await repository.getData()).people).toEqual([])
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('shows account A’s data again after B was used', async () => {
    const a = await openKindyRepository(accountA)
    await a.initialize()
    await a.replaceData(data([accountA.id]))

    const b = await openKindyRepository(accountB)
    await b.initialize()
    expect((await b.getData()).people).toEqual([])

    const again = await openKindyRepository(accountA)
    await again.initialize()
    expect((await again.getData()).people).toHaveLength(1)
  })

  it('wipes one account’s store and nothing else', async () => {
    const a = await openKindyRepository(accountA)
    await a.initialize()
    await a.replaceData(data([accountA.id]))
    const b = await openKindyRepository(accountB)
    await b.initialize()
    await b.replaceData(data([accountB.id]))

    await a.destroy()

    expect(await storedFor(accountA.id)).toBeNull()
    expect((await storedFor(accountB.id))?.people).toHaveLength(1)
    expect(BrowserKindyRepository.exists(STORAGE_KEY)).toBe(false)
  })
})
