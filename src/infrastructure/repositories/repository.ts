import { Capacitor } from '@capacitor/core'

import type { KindyRepository } from '@/domain/ports'

import { SqliteKindyRepository } from '@/infrastructure/database/SqliteKindyRepository'

import { BrowserKindyRepository } from './BrowserKindyRepository'

let repository: KindyRepository | undefined

export function getKindyRepository(): KindyRepository {
  repository ??= Capacitor.isNativePlatform()
    ? new SqliteKindyRepository()
    : new BrowserKindyRepository()
  return repository
}
