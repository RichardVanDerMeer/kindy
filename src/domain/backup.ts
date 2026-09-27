import type { KindyData } from './model'

export const BACKUP_FORMAT = 'kindy-backup'
export const BACKUP_VERSION = 1

export interface KindyBackup {
  format: typeof BACKUP_FORMAT
  version: number
  createdAt: number
  data: KindyData
}

export class BackupError extends Error {
  constructor(readonly reason: 'invalid' | 'newer-version') {
    super(reason === 'invalid' ? 'This is not a Kindy backup' : 'This backup needs a newer Kindy')
  }
}

const collections = [
  'people',
  'externalIdentities',
  'circles',
  'memberships',
  'relationships',
  'notes',
  'events',
  'reminders',
  'reminderOccurrences',
  'interactions',
  'syncQueue',
] as const satisfies ReadonlyArray<keyof KindyData>

export function createBackup(data: KindyData, createdAt: number): string {
  const backup: KindyBackup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, data }
  return JSON.stringify(backup)
}

/**
 * Parses and checks a backup before anything is replaced. Collections that an
 * older backup did not have yet are filled in as empty.
 */
export function readBackup(content: string, currentSchemaVersion: number): KindyBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new BackupError('invalid')
  }
  const backup = parsed as Partial<KindyBackup> | null
  if (!backup || backup.format !== BACKUP_FORMAT || typeof backup.version !== 'number') {
    throw new BackupError('invalid')
  }
  const data = backup.data as Partial<KindyData> | undefined
  if (!data || !Array.isArray(data.people) || typeof data.schemaVersion !== 'number') {
    throw new BackupError('invalid')
  }
  if (backup.version > BACKUP_VERSION || data.schemaVersion > currentSchemaVersion) {
    throw new BackupError('newer-version')
  }
  const normalized = { ...data, schemaVersion: currentSchemaVersion } as KindyData
  for (const key of collections) {
    if (!Array.isArray(normalized[key])) (normalized[key] as unknown[]) = []
  }
  return {
    format: BACKUP_FORMAT,
    version: backup.version,
    createdAt: typeof backup.createdAt === 'number' ? backup.createdAt : 0,
    data: normalized,
  }
}

/**
 * An empty Kindy must never overwrite a real backup: on a new phone the app
 * starts empty until the user restores.
 */
export function isWorthBackingUp(data: KindyData): boolean {
  return data.people.length > 0
}
