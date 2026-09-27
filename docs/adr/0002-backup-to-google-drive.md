# ADR 0002 — Back up Kindy to the user's Google Drive

- Status: accepted
- Date: 2026-09-27

## Context

Kindy starts as an Android-only app and stores everything locally in an
encrypted SQLite database. The database key lives in the Android Keystore and
never leaves the device, and Android's own backup is switched off for Kindy.
Without a backup of our own, a new or reset phone means losing every note,
circle, connection and memo.

The plan listed "strictly on-device or encrypted cloud backup" as an open
decision.

## Decision

Kindy backs up its full data set to the hidden app folder of the user's own
Google Drive (`drive.appdata` scope). It runs no server of its own.

- **What:** the complete Kindy data set, including photos stored with it and
  the Google sync queue, as one JSON file (`kindy-backup.json`) with a format
  and version header.
- **When:** automatically about 30 seconds after the last change, at least once
  a day while Kindy is used, and on request ("Back up now"). It runs while the
  app is open; a background job cannot read the app's data without the app.
- **Protection:** tied to the Google account, like WhatsApp's default backup.
  There is no extra backup password. The file is protected by the Google
  account and Google's encryption at rest; anyone with access to the Google
  account can read it. The app says this in Settings.
- **Restore:** a new phone opens with "Restore from Google Drive". Kindy signs
  in with Google, shows the backup date and replaces the local data after the
  backup is validated. Restoring over existing data warns first.
- **Safety:** an empty Kindy never uploads, so a fresh install cannot overwrite
  the real backup before the user restores. A backup from a newer Kindy is
  refused instead of loaded partially.
- Android's own Auto Backup stays off: it cannot restore the Keystore key and
  gives no control over timing or contents.

## Consequences

- One more OAuth scope in the same Google consent screen.
- One file is kept and overwritten; there is no history of older backups yet.
- A backup password (end-to-end encryption) can be added later as an option
  without changing the file location.
- A manual export file remains useful as a way out without Google.
