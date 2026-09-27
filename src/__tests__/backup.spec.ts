import { describe, expect, it } from 'vitest'

import { BackupError, createBackup, isWorthBackingUp, readBackup } from '@/domain/backup'
import type { KindyData } from '@/domain/model'

function data(overrides: Partial<KindyData> = {}): KindyData {
  return {
    schemaVersion: 5,
    people: [],
    externalIdentities: [],
    circles: [],
    memberships: [],
    relationships: [],
    notes: [],
    events: [],
    reminders: [],
    reminderOccurrences: [],
    interactions: [],
    syncQueue: [],
    ...overrides,
  }
}

const robin = {
  id: 'robin',
  displayName: 'Robin',
  isFavorite: true,
  isArchived: false,
  isDeceased: false,
  contactPoints: [],
  details: [],
  createdAt: 0,
  updatedAt: 0,
}

describe('backups', () => {
  it('round-trips all Kindy data', () => {
    const original = data({ people: [robin] })
    const backup = readBackup(createBackup(original, 42), 5)
    expect(backup.createdAt).toBe(42)
    expect(backup.data).toEqual(original)
  })

  it('fills collections an older backup did not have', () => {
    const old = JSON.parse(createBackup(data({ people: [robin] }), 1))
    old.data.schemaVersion = 4
    delete old.data.syncQueue
    const restored = readBackup(JSON.stringify(old), 5)
    expect(restored.data.syncQueue).toEqual([])
    expect(restored.data.schemaVersion).toBe(5)
  })

  it('rejects other files and backups from a newer Kindy', () => {
    expect(() => readBackup('{"hello":1}', 5)).toThrow(BackupError)
    expect(() => readBackup('not json', 5)).toThrow(BackupError)
    const newer = JSON.parse(createBackup(data({ schemaVersion: 9 }), 1))
    expect(() => readBackup(JSON.stringify(newer), 5)).toThrow(/newer Kindy/)
  })

  it('never lets an empty Kindy overwrite a backup', () => {
    expect(isWorthBackingUp(data())).toBe(false)
    expect(isWorthBackingUp(data({ people: [robin] }))).toBe(true)
  })
})
