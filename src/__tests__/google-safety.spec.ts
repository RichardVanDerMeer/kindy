import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * ADR 0005, section 5: Kindy never deletes a Google contact and never edits
 * contacts in bulk. These checks read the native Google bridge and the
 * TypeScript gateway, so such a call cannot slip in unnoticed.
 */
const nativeBridge = readFileSync(
  resolve(
    __dirname,
    '../../android/app/src/main/java/nl/richardvandermeer/kindy/contacts/KindyGoogleContactsPlugin.kt',
  ),
  'utf8',
)
const gateway = readFileSync(
  resolve(__dirname, '../infrastructure/contacts/googleContactsGateway.ts'),
  'utf8',
)

describe('Google Contacts safety', () => {
  it('has no People API delete or batch call', () => {
    for (const source of [nativeBridge, gateway]) {
      expect(source).not.toMatch(/deleteContact/i)
      expect(source).not.toMatch(/batch(Create|Update|Delete)Contacts/i)
      expect(source).not.toMatch(/people:batch/i)
    }
  })

  it('sends DELETE only to Kindy’s own file in the Drive app folder', () => {
    const deletes = [...nativeBridge.matchAll(/send\(\s*"DELETE",\s*([^,]+),/g)].map((match) =>
      match[1]?.trim(),
    )
    expect(deletes).toEqual(['"$DRIVE_API_URL/files/$fileId"'])
  })

  it('never sends DELETE through any other request helper', () => {
    const deleteMentions = nativeBridge.match(/"DELETE"/g) ?? []
    expect(deleteMentions).toHaveLength(1)
  })
})
