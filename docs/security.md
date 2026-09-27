# Kindy — security and privacy notes

Status after the review of 27 September 2026. Kindy is an Android app that
keeps personal data about the user's contacts, so the rules below are
requirements, not suggestions. Tests enforce the ones marked (test).

## Google Contacts

**Kindy never deletes a Google contact.** There is no code path to the People
API's delete calls, and a test fails if one appears in the Android plugin or
the gateway (test). Deleting or archiving a person in Kindy never touches
Google. Revoking access only revokes Kindy's token.

**Kindy only changes what the user changed.** Every queued change records the
fields the user edited (`SyncOperation.fields`). A sync writes only those
fields, so a new birthday can never overwrite a name or phone number that was
changed in Google in the meantime (test). Within a changed field:

- phone numbers, email addresses and events that Kindy did not write are kept,
  including their Google labels (test);
- a name update changes only first and last name and keeps middle names,
  prefixes and phonetic names (test);
- fields the user marked "keep in Kindy only" are never written (test).

**Kindy only writes the linked contact, in the linked account.**

- The contact is addressed by the resource name stored when it was linked,
  validated on the Android side (`^people/[A-Za-z0-9_-]+$`).
- Kindy reads the contact first and updates with that exact `etag`, so a
  contact that changed in between is refused instead of overwritten.
- A contact linked under another Google account is never written with the
  current account's access (test).

Residual risk: "Also save in Google Contacts" on a new person can create a
duplicate if that person already exists in Google without being linked.

## Data on the device

- The database is SQLite encrypted with a random key held in the Android
  Keystore; the key never leaves the device.
- Android backup and device transfer are switched off; Kindy's own backup to
  the user's Google Drive is used instead (ADR 0002). That backup is protected
  by the Google account, not by an extra password — a deliberate choice.
- Google tokens live only in memory on the native side, are refreshed silently
  when they expire and are never stored or logged.
- `FLAG_SECURE` keeps Kindy out of screenshots and the recent-apps preview.
- The optional app lock uses biometrics or the device credential.
- No analytics, no crash reporting, no logging of personal data.

## Home-screen widget

- The widget only reads a small snapshot the app prepares: dates, titles and
  opaque person ids. No notes, numbers or addresses.
- "Hide names" replaces titles with the kind of item and drops details and
  places (test). **With the app lock on, names are always hidden**, because the
  widget sits outside the lock.
- Widget taps open `kindy://` links. Only `kindy://upcoming` and
  `kindy://people/<id>` are accepted (test); the activity has no public
  `VIEW` intent filter.

## Web content inside the app

- The production build ships a Content Security Policy: only Kindy's own
  scripts, no inline scripts, images only from the app, data URLs and Google's
  photo host.
- No `v-html`; all text is escaped by Vue.
- Links from user input or a restored backup (wish-list links) are limited to
  `http(s)` so `javascript:` or `intent:` links cannot run (test).
- Search terms are reduced to letters and digits before they reach SQLite FTS.

## Permissions

| Permission                   | Why                                | When asked          |
| ---------------------------- | ---------------------------------- | ------------------- |
| Google Contacts (read/write) | Import, write back dates and edits | Connect Google      |
| Google Drive app folder      | Backup and restore                 | Connect Google      |
| Calendar (read/write)        | Link and plan appointments         | Connect calendar    |
| Biometrics                   | App lock                           | Turning the lock on |
| Notifications                | Reminders (planned)                | Not used yet        |

## Known open points

- Google OAuth verification is required before a public release (sensitive
  scopes).
- The Android code has not been compiled or tested on a device yet.
- `pnpm audit` reports one moderate issue in a Capacitor CLI dependency
  (`xcode` → `uuid`); it is a build tool for iOS projects and not part of the
  app.
