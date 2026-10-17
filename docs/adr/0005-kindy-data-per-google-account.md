# ADR 0005 — Kindy data per Google account; disconnect and wipe

- Status: accepted
- Date: 2026-10-17
- Builds on: ADR 0004

## Context

ADR 0004 makes Google Contacts the only source of people. Kindy's own data
(circles, notes, relationships, ...) is stored in one local database and
backed up to the Drive app folder of whichever Google account is connected.
Nothing ties the local database to an account: connecting a second account
would mix its contacts into the first account's data and back that data up to
the wrong Drive.

There is also no way to disconnect Google, and no way to remove Kindy's data
from a phone.

## Decision

### 1. One local database per Google account

- Kindy's data belongs to the Google account it was made with. Each account
  has its own encrypted database on the device, named after a hash of the
  account id (`kindy_<hash>`); the encryption key stays the one device key in
  the Android Keystore.
- The device remembers which account is connected. Without one, Kindy shows
  only "Connect Google Contacts": no people, circles or widget content.
- Connecting account A opens A's database. If there is none yet, Kindy starts
  empty for A and offers to restore A's backup from Drive.
- Connecting account B opens B's own database. Nothing of A is shown.
- Connecting A again opens A's database as it was, also offline.
- Per device, not per account: language, name order, app lock and widget
  settings.

### 2. The account is fixed once connected

- Every Google call after connecting asks Google for that specific account
  (`setAccount`), also the silent background authorisation. If Google returns
  a different account, Kindy refuses the connection: changes stay queued and
  no backup runs. This prevents writing A's data to B's contacts or Drive.
- Google's account id identifies the account. If Google returns none, the
  connection fails; there is no shared fallback id.
- Importing contacts uses the connected account; the import screen never
  offers another account. To use another account, disconnect first.

### 3. Disconnect

"Disconnect Google" in Settings:

- revokes Kindy's Google access for the account and closes its database;
- keeps the account's data on the device and in Drive, including changes that
  were not sent to Google yet (they are sent after reconnecting);
- clears the home-screen widget and returns to "Connect Google Contacts".

### 4. Wipe

"Delete Kindy data" in Settings, for the connected account only:

- deletes that account's Kindy database from this device;
- optionally also deletes Kindy's backup from that account's Drive app folder;
- then disconnects (section 3);
- always asks for confirmation and cannot be undone.

Wiping removes Kindy's own data only. Google Contacts are never touched.

### 5. Kindy never deletes contacts and never edits in bulk

- Kindy has no way to delete a Google contact: the native Google bridge has
  no delete call for the People API, and none may be added.
- Kindy never calls People API batch endpoints. Every write is one contact
  and only the fields the user just changed (ADR 0004).
- A unit test reads the native bridge and fails if a People API delete or
  batch call appears. The only `DELETE` allowed is for Kindy's own backup file
  in the Drive app folder.

### 6. Existing data

The single database from before this decision (`kindy`) is moved to the
first account that connects, when its linked contacts belong to that account
or when it has none. Otherwise it is left alone until its own account
connects. The move copies the data into the account's database and then
removes the old one.

## Consequences

- Switching accounts is disconnect, then connect. Kindy shows one account at a
  time.
- The device keeps each account's database until it is wiped; disconnecting
  frees nothing.
- Background sync and backups only run while an account is connected.
- The browser preview uses the same per-account storage; in development it
  connects the preview account automatically so the demo keeps working.
