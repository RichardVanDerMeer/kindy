# ADR 0001 — Write selected fields back to Google Contacts

- Status: accepted
- Date: 2026-09-27

## Context

Kindy imported Google Contacts read-only. Users add birthdays, wedding days and
dates of death in Kindy, and expect them to exist in their Google address book
as well, so that phones, calendars and other apps see the same dates. New people
added while creating a connection should also be able to live in Google.

The original plan listed "full two-way writing to Google Contacts" as out of
scope for the MVP.

## Decision

Kindy writes a small, fixed set of fields back to linked Google contacts. It is
not a full two-way sync.

| Kindy                    | Google People API field          |
| ------------------------ | -------------------------------- |
| Birthday (year optional) | `birthdays`                      |
| Wedding day, anniversary | `events` with type `anniversary` |
| Date of death            | `events` with custom type label  |
| New person (opt-in)      | `people:createContact`           |

Relationships and circles stay in Kindy only: Google stores relations as free
text, which would go stale on renames.

- **Automatic, with a setting.** Changes to linked contacts are written
  automatically; Settings has a switch to turn write-back off. "Also save in
  Google Contacts" is on by default for new people once Google is connected.
- **Local first.** Every change is saved in Kindy immediately and added to a
  sync queue (one coalesced operation per person). The queue runs after
  changes, at start-up and when the device comes online. It needs no UI:
  reconnecting is silent, and a missing consent keeps work queued.
- **Only Kindy's own values.** Before writing, Kindy reads the contact and
  sends only the fields that changed (`updatePersonFields`). Events that Kindy
  did not write are kept. Kindy stores what it last wrote per contact, so it
  can replace its own earlier values without touching others.
- **Visible status.** Each person shows "In Google Contacts", "Waiting for
  Google", "Not saved in Google · Try again" or "Only in Kindy".

## Consequences

- The OAuth scope changes from `contacts.readonly` to `contacts`. Existing
  users are asked for consent again. The scope is sensitive, so Google's OAuth
  verification is required before a public release (as it already was for the
  read-only scope).
- The settings copy no longer promises read-only access.
- A value edited both in Google and in Kindy between syncs can end up twice
  (Kindy's value is added next to the changed Google one). Import-side
  conflict handling (plan §6) resolves this later.
- Schema version 5 adds `sync_operations` and `written_fields_json` on
  `external_identities`.
- Error details stored on failed operations contain only HTTP status text,
  never response bodies or contact data.
