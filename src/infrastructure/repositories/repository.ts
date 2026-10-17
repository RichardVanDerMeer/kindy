import { Capacitor } from '@capacitor/core'

import type { KindyData } from '@/domain/model'
import type { KindyAccount, KindyRepository } from '@/domain/ports'

import { DATABASE_NAME } from '@/infrastructure/database/migrations'
import { SqliteKindyRepository } from '@/infrastructure/database/SqliteKindyRepository'

import { BrowserKindyRepository, STORAGE_KEY } from './BrowserKindyRepository'

/** The preview account the browser demo belongs to. */
const PREVIEW_ACCOUNT_ID = 'preview-account'

/**
 * A short, stable name for an account's store. The account id itself never
 * appears in a file name.
 */
export async function accountStoreKey(accountId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accountId))
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/** The store from before ADR 0005 may go to an account when all its linked contacts are that account's. */
export function belongsToAccount(data: KindyData, accountId: string): boolean {
  return data.externalIdentities.every((identity) => identity.providerAccountId === accountId)
}

interface StoreAdapter {
  exists(): Promise<boolean>
  open(): KindyRepository
}

/** Copies the single store from before ADR 0005 into the account's own store, then removes it. */
async function adoptLegacy(target: StoreAdapter, legacy: StoreAdapter, accountId: string) {
  if ((await target.exists()) || !(await legacy.exists())) return
  const old = legacy.open()
  await old.initialize()
  const data = await old.getData()
  if (!belongsToAccount(data, accountId)) {
    // Another account's data: it stays until that account connects.
    await old.close()
    return
  }
  const next = target.open()
  await next.initialize()
  await next.replaceData(data)
  await next.close()
  await old.destroy()
}

/**
 * Opens (not yet initialises) the store of one Google account (ADR 0005).
 * Each account has its own store; the single store from before is moved to
 * the first account it belongs to.
 */
export async function openKindyRepository(account: KindyAccount): Promise<KindyRepository> {
  const key = await accountStoreKey(account.id)

  if (Capacitor.isNativePlatform()) {
    const name = `kindy_${key}`
    const target: StoreAdapter = {
      exists: () => SqliteKindyRepository.exists(name),
      open: () => new SqliteKindyRepository(name),
    }
    const legacy: StoreAdapter = {
      exists: () => SqliteKindyRepository.exists(DATABASE_NAME),
      open: () => new SqliteKindyRepository(DATABASE_NAME),
    }
    await adoptLegacy(target, legacy, account.id)
    return target.open()
  }

  const storageKey = `${STORAGE_KEY}.${key}`
  // The demo data belongs to the preview account only.
  const seedDemo = account.id === PREVIEW_ACCOUNT_ID
  const target: StoreAdapter = {
    exists: async () => BrowserKindyRepository.exists(storageKey),
    open: () => new BrowserKindyRepository(storageKey, seedDemo),
  }
  const legacy: StoreAdapter = {
    exists: async () => BrowserKindyRepository.exists(STORAGE_KEY),
    open: () => new BrowserKindyRepository(STORAGE_KEY, false),
  }
  await adoptLegacy(target, legacy, account.id)
  return target.open()
}

/** The account the browser preview connects to automatically in development. */
export const previewAccount: KindyAccount = {
  id: PREVIEW_ACCOUNT_ID,
  email: 'preview@kindy.test',
  displayName: 'Google-preview',
}
