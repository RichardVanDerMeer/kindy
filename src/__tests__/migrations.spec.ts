import { describe, expect, it } from 'vitest'

import { DATABASE_VERSION, migrations, splitStatements } from '@/infrastructure/database/migrations'

describe('database migrations', () => {
  it('passes one statement per entry, as Android runs only the first of a string', () => {
    for (const migration of migrations) {
      for (const statement of migration.statements) {
        expect(statement.trim().replace(/;$/, '')).not.toContain(';')
      }
    }
  })

  it('creates the people table in the first migration', () => {
    expect(
      migrations[0]?.statements.some((s) => s.includes('CREATE TABLE IF NOT EXISTS people')),
    ).toBe(true)
  })

  it('covers every version up to the current one', () => {
    expect(migrations.map((migration) => migration.toVersion)).toEqual(
      Array.from({ length: DATABASE_VERSION }, (_, index) => index + 1),
    )
  })

  it('splits a block into trimmed statements', () => {
    expect(splitStatements('\nPRAGMA a = 1;\n\nCREATE TABLE t (x);\n')).toEqual([
      'PRAGMA a = 1;',
      'CREATE TABLE t (x);',
    ])
  })
})
