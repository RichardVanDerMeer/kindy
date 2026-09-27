# ADR 0003 — Link appointments through the phone's calendar

- Status: accepted
- Date: 2026-09-27

## Context

Many moments with people (a dinner, a birthday party, padel with a friend)
already live in the user's calendar, not in Kindy. Users want those
appointments next to the people involved, and want to plan new ones from
Kindy without typing them twice.

Kindy is Android-only for now (ADR 0002). Android keeps every synced calendar
(Google, Exchange, others) in one on-device calendar store.

## Decision

Kindy reads and writes appointments through Android's calendar store
(`CalendarContract`), not through the Google Calendar API.

- **Permission:** Android's calendar permission (read and write), asked when
  the user taps "Connect calendar". No extra Google scope or verification.
- **Calendar → Kindy:** Kindy reads a window of a week back to three months
  ahead and suggests links. A guest email that belongs to someone in Kindy is
  a strong match; a name in the title counts when it is unambiguous (a full
  name, or a first name only one person has). The user taps "Link" or
  "Ignore"; nothing is linked without confirmation, and ignored appointments
  are not suggested again.
- **Kindy → calendar:** "Plan appointment" adds the appointment to the chosen
  calendar (default: the primary one, configurable in Settings) and links it.
- **Reference:** Kindy stores the calendar event id and start time, plus a copy
  of title, time and location, so linked appointments still show without
  calendar access. Title and location are refreshed when the calendar is read.
- Linked appointments appear in Upcoming (filter "Appointments"), on the
  person's profile and in their timeline.

## Consequences

- Works offline and with every account on the phone, not only Google.
- A future desktop or iOS app needs its own calendar adapter; the matching and
  linking logic is shared.
- An appointment moved to another start time in the calendar is no longer
  matched to its link (the key includes the start time); it can be suggested
  and linked again.
- Suggestions only use the user's own data on the device; appointment
  contents are not sent anywhere.
