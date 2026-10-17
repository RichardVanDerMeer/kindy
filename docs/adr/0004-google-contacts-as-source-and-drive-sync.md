# ADR 0004 — Google Contacts as the only source of people, Kindy data synced through Drive

- Status: accepted
- Date: 2026-10-17
- Supersedes: ADR 0001, ADR 0002

## Context

Kindy has two sources of people: contacts imported from Google and people
added in Kindy only ("Only in Kindy"). Changes go one way: Kindy writes a fixed
set of fields back to Google (ADR 0001), but changes made in Google never reach
Kindy after the first import. The People API's incremental sync
(`syncToken`) is implemented in the gateway but not used.

Everything Kindy adds on top of a contact lives only on the phone, with one
overwritten backup file in Drive (ADR 0002). A second device, or a phone used
next to a tablet, cannot share that data.

The user's address book should stay the single place where people live, and
Kindy should not change how that address book is organised.

## Decision

### 1. People come only from Google Contacts

- Every person in Kindy is a Google contact. "Only in Kindy" disappears.
- "Add person" creates a Google contact. Offline, the person is created
  locally with a pending create in the sync queue and shows "Waiting for
  Google" until it is confirmed.
- A person is identified by the Google `resourceName`. Kindy's own data refers
  to people by that `resourceName`, never by a local id, so it lands on the
  right person on every device.
- The per-field "keep only in Kindy" option (`syncExclusions`) is removed for
  fields stored in Google.

### 2. Everything Google can store about a person is stored in Google

| Kindy                                 | People API field                 |
| ------------------------------------- | -------------------------------- |
| Name (given, middle, family)          | `names`                          |
| Nickname                              | `nicknames`                      |
| Phone numbers with label              | `phoneNumbers`                   |
| Email addresses with label            | `emailAddresses`                 |
| Addresses with label                  | `addresses`                      |
| Websites and social profiles          | `urls`                           |
| Birthday (year optional)              | `birthdays`                      |
| Wedding day, anniversary              | `events` with type `anniversary` |
| Date of death                         | `events` with custom type label  |
| Jobs (title, employer, start and end) | `organizations`                  |
| About                                 | `biographies` (Google's "Notes") |
| Photo                                 | `photos` (`updateContactPhoto`)  |

Kindy never writes:

- `memberships` (contact groups, labels, "starred"). Labels are shared with
  Gmail, the phone and shared address books; Kindy does not reorganise them.
- `relations`. Google stores them as free text that goes stale on renames.
- `userDefined` and `clientData`. Their labels and limits make them fragile
  for structured data; Kindy-only data goes to Drive instead (section 4).

### 3. Two-way sync with Google Contacts

- **Incoming.** Kindy calls `people.connections.list` with
  `requestSyncToken` and stores the `nextSyncToken`. Later runs pass the token
  and receive only changed and deleted contacts. Google's values replace the
  local copy of the fields in section 2. An expired token (after about seven
  days) triggers a full read.
- **Outgoing.** The existing sync queue stays: one coalesced operation per
  person, writing only the fields the user changed (`updatePersonFields`).
  Before writing, Kindy reads the contact; a stale `etag` means the contact is
  read again and the change is applied on top of Google's current values.
- **Runs** at start-up, when the app returns to the foreground, after a change
  and when the device comes online.
- **Deleted in Google.** The person is hidden in Kindy and marked
  `remoteDeletedAt`. Their Kindy data (section 4) is kept for 30 days, so an
  undo in Google (which restores the same `resourceName`) brings it back, and
  is removed after that.

### 4. Kindy's own data syncs through the Drive app folder

Data Google cannot hold stays in Kindy and is shared between devices through
the hidden app folder of the user's Drive (`drive.appdata`, already granted).
No server is involved.

Kindy-only data:

- Circles (name, description, colour, icon, background image) and memberships
- Relationships
- Notes and memos
- Reminders (definitions and completed occurrences)
- Interactions
- Wish list items
- Calendar links
- Per-person fields without a Google counterpart: favourite, archived,
  pronouns, how we met

**One file per device.** Each device writes only its own file,
`sync/device-<deviceId>.json`, and reads the files of all devices. Drive v3
offers no reliable compare-and-swap on a shared file, so a shared file could
silently lose a write from another device; per-device files cannot conflict.

**Records, not snapshots.** Every record has a stable id, `updatedAt`,
`updatedBy` (device id) and an optional `deletedAt`. Merging keeps, per record,
the version with the latest `updatedAt` (device id breaks ties). Deletions are
tombstones, so a deleted record cannot come back from another device.
Tombstones are removed after 90 days; a device that has not synced for longer
discards its local Kindy data and reads it fresh from Drive.

**Binary files.** Photos and background images are separate files in the app
folder (`media/<hash>`), referenced by hash, so the JSON stays small and
unchanged images are not uploaded again.

**When.** At start-up, on returning to the foreground, about 30 seconds after
the last change and every few minutes while the app is open. Kindy asks the
Drive changes API (`spaces=appDataFolder`) whether anything changed before
downloading files. Drive push notifications need a server and are not used.

**Device-specific data.**

- Calendar links store the event's iCal UID next to the device's event id, so
  another device can find the same appointment in its own calendar store.
- Reminder notifications are scheduled by each device from the synced
  definitions; completing an occurrence syncs, so it disappears everywhere.

### 5. On the device

The encrypted SQLite database (Android Keystore key) keeps a local copy of the
Google fields and the Kindy data, plus the Google sync queue and the Drive
sync state (`syncToken`, Drive change page token, last merged version per
device). Kindy works fully offline and catches up on the next sync.

### 6. Backup and restore

The Drive app folder replaces the single backup file of ADR 0002. A new phone
signs in with Google, reads the contacts and merges the device files; there
is no separate restore step. An empty Kindy still never writes its device
file before its first successful merge, so a fresh install cannot hide the
real data behind newer tombstones. A manual export file stays available as a
way out without Google.

## Consequences

- Schema change: people lose local-only origin, Kindy records gain
  `updatedAt`/`updatedBy`/`deletedAt`, references move to `resourceName`,
  calendar links gain an iCal UID. Existing "Only in Kindy" people are offered
  "Save to Google" once; people the user declines are removed after
  confirmation.
- The People API read mask grows (`addresses`, `urls`, `organizations`,
  `nicknames`, `biographies`), and so do the fields Kindy writes. The
  `contacts` scope is unchanged.
- A field edited both in Google and in Kindy between syncs resolves in favour
  of the last write; Kindy reads before it writes, so the window is small.
- Circles and relationships are invisible outside Kindy. That is intended:
  the address book looks the same with or without Kindy.
- Revoking Kindy's Google access does not delete the app folder. "Disconnect
  Google" in Settings offers to delete Kindy's Drive data first.
- Anyone with access to the Google account can read the Drive files, as with
  the backup today. An optional backup password (end-to-end encryption) can be
  added later without changing file locations.
- The limits of `biographies` (one value, plain text) apply to "About".

## Alternatives considered

- **Circles as Google contact groups (labels).** Rejected: labels are shared
  with Gmail, the phone and shared address books, and one mistake changes the
  user's address book everywhere.
- **Kindy data in `clientData` on each contact.** Rejected: it spreads circle
  and relationship data over hundreds of contacts, turns every circle change
  into many Google writes and gives no place for data about several people.
- **One shared sync file in Drive.** Rejected: no safe concurrent writes.
- **Own sync server.** Rejected: Kindy runs no servers.
