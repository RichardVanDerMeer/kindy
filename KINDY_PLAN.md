# Kindy — Personal CRM

Implementation plan for an Android-first personal CRM focused on remembering personal details and understanding how people are connected.

> Working name: **Kindy** — Frisian-inspired: “ken jou” / “know you”  
> Product label: **Kindy · Personal CRM**  
> Primary platforms: Android, with an architecture that can later support iOS and web  
> UI languages at launch: English and Dutch

## 1. Product vision

Kindy is a private personal CRM for the people in someone's life. It is not a sales tool and does not treat people as leads. It helps the user answer two questions:

1. What do I want to remember about this person?
2. How is this person connected to the other people in my life?

The app combines structured personal details, free-form notes, relationships, circles, important dates, reminders and contact history in one calm interface.

### Product principles

- **People, not leads:** no deals, pipelines, conversion scores or sales terminology.
- **Private by default:** sensitive data remains local unless the user explicitly enables a future sync service.
- **Local-first:** the core app works without an internet connection after import.
- **User-controlled:** imports, merges and suggested duplicates always require confirmation.
- **Fast capture:** adding a detail, note or reminder should take only a few taps.
- **Explain data origin:** show whether data comes from Google Contacts or Kindy.
- **No guilt mechanics:** reminders should feel helpful, not judge the user for losing contact.
- **Accessible:** readable contrast, scalable text, meaningful labels and reduced-motion support.

## 2. Scope

### MVP

The first usable version includes:

- Local people database.
- Manually created people, requiring only a name.
- Google Contacts import.
- Reimport/synchronization from Google without duplicating people.
- Merge a local Kindy person into a Google-linked person.
- Duplicate detection and a manual merge flow.
- Structured details and custom fields.
- Free-form notes.
- Favorites.
- Circles and roles within circles.
- Bidirectional relationships between people.
- Birthdays, anniversaries and custom important dates.
- One-time and recurring reminders.
- Upcoming overview.
- Manual contact moments and a per-person timeline.
- Search across people, details, notes and circles.
- Android notifications.
- Two Android home-screen widgets.
- English and Dutch localization.
- Local export and backup/restore.

### Explicitly not in the MVP

- Sales pipelines or shared team CRM features.
- Automatic ingestion of WhatsApp, Signal or phone-call contents.
- AI-generated relationship scores.
- Automatic social-media enrichment.
- Full two-way writing to Google Contacts.
- Multi-device cloud synchronization.
- iOS widgets.

These may be explored after the Android MVP proves useful.

## 3. Recommended technical approach

### Application stack

- Vue 3 with `<script setup lang="ts">`.
- TypeScript with strict mode enabled.
- Vite.
- Capacitor for the Android application shell and native bridges.
- Vue Router.
- Pinia for application/session state, not as the primary persistence layer.
- SQLite for the local database.
- An explicit repository/service layer between UI and storage.
- Vitest for unit and integration tests.
- Playwright for browser-level flows where useful.
- Native Android tests for widgets and platform-specific bridges.
- `vue-i18n` for English and Dutch translations.
- pnpm as package manager.

Do not pin dependency versions in this plan. Before scaffolding, verify the current stable and mutually compatible releases of Vue, Vite, Capacitor, Android Gradle Plugin, Kotlin, Jetpack Glance and the selected SQLite plugin.

### Native Android components

The main interface is Vue/Capacitor. These features require native Android code or a native bridge:

- Google authorization if the selected Capacitor integration does not cover the required OAuth flow.
- Secure token storage.
- Home-screen widgets, implemented in Kotlin with Jetpack Glance.
- Widget data snapshots and widget refresh triggers.
- Any notification behavior that cannot be expressed through Capacitor Local Notifications.

Glance widgets use their own restricted composables and cannot render the Vue UI directly. Treat widgets as a small native presentation layer reading a deliberately limited data snapshot.

### Architecture

```text
Vue UI
  -> application use cases
    -> domain model
      -> repositories
        -> SQLite
        -> Google People adapter
        -> notifications adapter
        -> Android widget bridge
```

Rules:

- UI components do not query SQLite or Google directly.
- Google is an external source attached to a Kindy person, not the canonical identity.
- Each person always has an internal Kindy UUID.
- Imported values retain source metadata.
- Domain logic for merging, reciprocal relationships and recurrence remains platform independent.
- Adapters expose interfaces so they can be replaced in tests.

## 4. Suggested repository structure

```text
kindy/
├── android/                       # Capacitor Android project and native widgets
├── docs/
│   ├── adr/
│   ├── design/
│   └── data-model.md
├── src/
│   ├── app/                       # bootstrap, router and app shell
│   ├── assets/
│   ├── components/
│   │   ├── base/                  # design-system primitives
│   │   └── domain/                # person, circle, note components
│   ├── composables/
│   ├── domain/
│   │   ├── people/
│   │   ├── relationships/
│   │   ├── circles/
│   │   ├── notes/
│   │   ├── events/
│   │   ├── reminders/
│   │   └── interactions/
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── google/
│   │   ├── notifications/
│   │   ├── secure-storage/
│   │   └── widgets/
│   ├── locales/
│   │   ├── en.json
│   │   └── nl.json
│   ├── stores/
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── themes.css
│   │   └── global.css
│   ├── types/
│   └── views/
├── tests/
│   ├── fixtures/
│   └── e2e/
├── capacitor.config.ts
├── vite.config.ts
└── package.json
```

Organize domain code by feature instead of creating global folders full of unrelated models and services.

## 5. Core domain model

The final schema should be documented separately and implemented with versioned migrations. This is the initial logical model.

### Person

- `id`: internal UUID, always authoritative.
- `displayName`.
- `givenName`, `middleName`, `familyName`, `nickname`.
- `photoRef`.
- `pronouns` optional.
- `isFavorite`.
- `isArchived`.
- `isDeceased` optional.
- `metThrough` or `howWeMet`.
- `createdAt`, `updatedAt`, `deletedAt`.

### External identity

Links a person to Google or a future provider.

- `id`.
- `personId`.
- `provider`: initially `google`.
- `providerAccountId`.
- `providerResourceId`.
- `etag` or remote version.
- `lastSyncedAt`.
- `remoteDeletedAt` optional.

Never use a Google resource name as the local primary key.

### Contact point

- `id`, `personId`.
- `kind`: phone, email, address, URL.
- `label`.
- `value` and normalized value.
- `isPrimary`.
- `source`: Kindy or Google.
- `sourceFieldId` where available.

### Person detail

Supports both common structured fields and user-created fields.

- `id`, `personId`.
- `definitionId`.
- typed value: text, long text, date, number, boolean or choice.
- `source`.
- `observedAt` optional, describing when the detail was learned or confirmed.

Initial definitions include occupation, employer, location, interests, gift ideas, food/drink preferences and how-you-met context.

### Note

- `id`.
- `body`.
- `occurredAt`.
- `isPinned`.
- `createdAt`, `updatedAt`.

Use a join table between notes and people so one note can concern multiple people.

### Relationship

- `id`.
- `fromPersonId`, `toPersonId`.
- canonical type.
- optional custom label.
- `startedOn`, `endedOn`.
- optional note.

Store one canonical relationship and derive its inverse for display. Examples:

| Stored direction | Derived inverse |
| --- | --- |
| parent of | child of |
| child of | parent of |
| partner of | partner of |
| sibling of | sibling of |
| introduced by | introduced |

Prevent self-relations and duplicate active relations.

### Circle and membership

Circle:

- `id`, `name`, `description`.
- `colorToken`, `iconKey`.
- `isArchived`.

Membership:

- `circleId`, `personId`.
- `role` optional.
- `startedOn`, `endedOn` optional.

A person can belong to multiple circles.

### Important event

- `id`.
- `type`: birthday, anniversary, memorial or custom.
- `title`.
- partial date supporting month/day without a year.
- recurrence rule.
- source and external source reference.

Use a join table between events and people. An anniversary can belong to both partners and should generate one upcoming item.

### Reminder

- `id`.
- optional `personId`, `noteId`, `eventId` or `interactionId`.
- `title`, optional description.
- `dueAt`.
- timezone strategy.
- recurrence rule.
- state: scheduled, completed, skipped or cancelled.
- notification offsets, for example one week before and on the day.
- `snoozedUntil`.

### Interaction

- `id`.
- `type`: conversation, call, message, visit, meal, meeting, event or custom.
- `occurredAt`.
- optional location and summary.

Use a join table between interactions and people. A board meeting or dinner can involve several people.

### Merge record

Record enough information to audit and, where reasonably possible, undo a merge:

- source person ID.
- target person ID.
- timestamp.
- field decisions.
- moved entity IDs.
- external identities involved.

## 6. Google Contacts integration

Use the Google People API and request the smallest viable OAuth scopes. The initial integration is import/read-only from Google's perspective.

Import these fields where available:

- Names and nickname.
- Profile photo.
- Phone numbers and email addresses.
- Postal addresses.
- Organizations and occupations.
- Birthday.
- Events, including Google events labelled as anniversary.
- Relations as source text only unless they can be matched safely to another Kindy person.
- Contact-group membership as optional import suggestions for circles.

Important behavior:

- The user chooses which contacts to import, with a later “import all” option.
- A Google anniversary is imported as an anniversary, not automatically claimed to be a wedding anniversary.
- Preserve dates without a year.
- Sync is incremental when supported by the API.
- Never silently overwrite a Kindy-edited value with a changed Google value.
- Surface conflicts and let the user choose Google, Kindy or both where the field permits multiple values.
- If a Google contact disappears, retain the Kindy person and mark the external source as unavailable.
- Revoking Google access must not delete local people, notes or relationships.

## 7. Merge and duplicate behavior

### Candidate detection

Score possible duplicates using normalized data:

1. Exact normalized phone number.
2. Exact normalized email address.
3. Full name plus another matching attribute.
4. Similar name alone may suggest a candidate but never auto-merge.

### Merge flow

1. Display the two records side by side.
2. Highlight matching and conflicting values.
3. Let the user select the retained value for single-value fields.
4. Retain all unique multi-value contact points.
5. Move notes, reminders, important events, interactions and circle memberships.
6. Repoint relationships and remove resulting duplicates or self-relations.
7. Attach external identities to the surviving Kindy person.
8. Store a merge record.
9. Refresh search indexes, notifications and widgets.

The common scenario “local person later matched with Google contact” should be a first-class flow rather than a generic database operation.

## 8. Functional requirements

### People

- List, sort and filter people.
- Create and edit a local person.
- Add, replace or remove a photo.
- Favorite, archive, soft-delete and restore.
- Import from Google.
- Display source and last-sync state.
- Open the phone, email or supported messaging intent.

### Details and notes

- Common structured fields.
- Custom typed fields.
- Multiple free-form notes per person.
- Pin a note.
- Link one note to multiple people.
- Full-text search within notes and details.

### Relationships

- Add, edit and end a relationship.
- Support family, social, professional and custom relationship types.
- Show inverse relationships automatically.
- Show an “Around this person” overview optimized for a phone screen.
- Navigate directly between connected people.

Do not infer parenthood from partnership. The partner of a parent is not automatically another parent.

### Circles

- Create, edit, color-code and archive circles.
- Add multiple people.
- Add a role per person.
- Show members, upcoming dates and recent shared interactions.

### Important dates

- Birthdays from Google and Kindy.
- Anniversaries from Google and Kindy.
- Wedding anniversary as a specific Kindy label.
- Memorial and custom dates.
- Dates with an unknown year.
- Age or anniversary count only when a year is known.
- Disable celebratory notifications for a deceased person.

### Reminders and notifications

- One-time reminder.
- Recurring reminder.
- Reminder linked to a person, note, event or interaction.
- Multiple notification offsets.
- Complete, skip, cancel and snooze.
- In-app Upcoming view works without notification permission.
- Notification text can hide personal details.
- Recreate scheduled notifications after relevant changes or device restart if required by the platform.

### Contact history

- Manually record an interaction.
- Link multiple participants.
- Timeline on each person profile.
- Add a follow-up reminder from an interaction.
- Do not count opening a communication app as confirmed contact.

### Search

- Search names, nicknames, contact points, structured details, notes, circle names and roles.
- Filter favorites, archived people, circle and upcoming event.
- Normalize accents and casing.
- Keep search useful offline.

### Backup and privacy

- Export all Kindy-owned data in a documented format.
- Include relationships and attachments or state clearly when binary files are separate.
- Restore into an empty app and validate schema compatibility.
- Optional biometric app lock.
- Store tokens using platform secure storage.
- Do not log personal note contents in production.

## 9. Navigation and key screens

Primary bottom navigation:

1. **People** — people list, favorites and circle filters.
2. **Circles** — circle overview and circle detail.
3. **Upcoming** — birthdays, anniversaries and reminders.
4. **Search** — global search and advanced filters.

The central add action opens a compact sheet for:

- Person.
- Note.
- Interaction.
- Reminder.
- Circle.

Key screens:

- Onboarding and language selection.
- Privacy explanation and Google connection.
- Google contact selection/import progress.
- People list.
- Person profile: Overview, Notes, Connections and Timeline.
- Add/edit person.
- Add detail/custom field.
- Add/edit relationship.
- Relationship overview.
- Circles list and circle detail.
- Upcoming list and calendar-style grouping.
- Add/edit reminder.
- Duplicate suggestions.
- Compare and merge.
- Settings, privacy, export and restore.

## 10. Visual design system

The approved direction is warm, clean and softly playful.

### Brand

- Name: **Kindy**.
- Descriptor: **Personal CRM**.
- Icon concept: two connected people in warm ivory and coral on a lavender rounded square.
- Avoid sales imagery, network graphs with dozens of nodes and corporate dashboard styling.

### Color roles

Use semantic design tokens rather than hard-coded colors:

- Background: warm near-white with restrained atmospheric pastel areas.
- Primary: lavender/violet.
- Text: dark aubergine.
- Family: peach.
- Football/team: mint.
- Board/work: powder blue.
- Notes: soft butter yellow.
- Error/destructive: accessible muted red distinct from peach.

Final color values must pass WCAG contrast checks for their intended use. Pastel colors are surfaces and accents; body text remains dark.

### Component language

- Rounded cards with restrained elevation.
- Atmospheric backgrounds remain outside or behind opaque reading surfaces.
- Circular avatars with a subtle circle-color halo where meaningful.
- One consistent outline-icon family.
- Minimum 48dp touch targets.
- Support Android font scaling without clipping.
- Motion is brief, subtle and disabled under reduced-motion preferences.

Create Storybook stories or an equivalent component gallery for all base components and critical states.

## 11. Android widgets

Implement widgets after the underlying Upcoming and Favorites use cases are stable.

### Widget A: Coming up

- Suggested initial size: wide 4x2, resizable.
- Shows the next two or three birthdays, anniversaries or reminders.
- Tap an item to open its event/person in Kindy.
- Empty state explains that nothing is due soon.
- Obeys the privacy setting for hiding names/details.

### Widget B: Favorites

- Suggested initial size: wide 4x2, resizable.
- Shows up to three configurable favorite people.
- Tap a person to open the profile.
- Quick action opens Add note with that person preselected when possible.

### Widget data bridge

- Vue/domain code writes a small sanitized widget snapshot after relevant changes.
- Native Kotlin code reads only that snapshot.
- The snapshot contains no unnecessary notes or private fields.
- Refresh widgets after person, favorite, reminder or important-event changes.
- Provide widget previews and responsive layouts for supported sizes.
- Verify behavior on at least Pixel Launcher and one other common launcher.

## 12. Delivery phases

Each phase should be implemented as one or more small, independently reviewable changes. Do not ask Codex to implement an entire phase in one prompt.

### Phase 0 — Discovery and decisions

Deliverables:

- Verify dependency compatibility and Android requirements.
- Create ADRs for local-first architecture, SQLite choice, Google auth, data ownership and widget bridge.
- Turn the visual proposal into initial tokens and component specifications.
- Define supported Android API range.
- Create a privacy/threat checklist.

Exit criteria:

- The app can be built on a clean machine.
- Architectural decisions and known risks are documented.

### Phase 1 — Project foundation and design system

Deliverables:

- Scaffold Vue 3, TypeScript, Vite and Capacitor Android.
- Configure linting, formatting, type checking and tests.
- Add routing, Pinia and localization.
- Add tokens, typography, icon strategy and base components.
- Build the app shell and the four primary navigation destinations using fixtures.

Exit criteria:

- The app installs and opens on a real Android device.
- English and Dutch can be switched without reload problems.
- Core components meet contrast, touch-target and font-scale requirements.

### Phase 2 — Local database and people

Deliverables:

- SQLite schema and migration runner.
- Person, contact point, detail and photo repositories.
- Create/edit/archive/favorite/restore flows.
- People list and person profile backed by real local data.
- Seed/fixture strategy for development only.

Exit criteria:

- People survive app restart and upgrade migration tests.
- No screen depends on hard-coded demo data.

### Phase 3 — Notes, circles and relationships

Deliverables:

- Notes with multiple linked people and pinned state.
- Circles with membership and roles.
- Canonical bidirectional relationships.
- Person overview and Around this person view.
- Domain and integration tests for relationship invariants.

Exit criteria:

- A family and a football board can be represented without duplicate people.
- Editing one relationship produces the correct inverse display.

### Phase 4 — Important dates, reminders and Upcoming

Deliverables:

- Partial dates and recurrence model.
- Birthdays, anniversaries and custom dates.
- Reminder CRUD, snooze and completion.
- Upcoming screen.
- Android notification permission and scheduling.
- Privacy-safe notification setting.

Exit criteria:

- Tests cover unknown years, leap day, timezones and recurrence boundaries.
- Upcoming remains fully usable when notification permission is denied.

### Phase 5 — Google Contacts integration

Start this phase with a small technical spike before building the full UX.

Deliverables:

- Google OAuth and secure token lifecycle.
- Contact selection and initial import.
- Source metadata and last-sync status.
- Incremental refresh or the safest supported alternative.
- Conflict presentation.
- Handling for revoked access and remotely deleted contacts.

Exit criteria:

- Reimporting the same Google account does not create duplicates.
- Revoking access leaves local Kindy information intact.
- Birthdays and anniversary events import correctly, including missing years.

### Phase 6 — Duplicate detection and merging

Deliverables:

- Candidate scoring.
- Duplicate suggestions view.
- Side-by-side compare and merge flow.
- Local-to-Google contact linking.
- Merge records and best-effort undo.

Exit criteria:

- Notes, circles, events, reminders, interactions and relationships survive a merge.
- Merge cannot create self-relations or duplicate active relationships.

### Phase 7 — Interactions and search

Deliverables:

- Manual interaction logging with multiple participants.
- Person timeline and circle activity.
- Follow-up reminder creation.
- Offline full-text search and filters.

Exit criteria:

- A shared meeting appears on every participant's timeline.
- Search finds structured details and note text with acceptable performance on a realistic dataset.

### Phase 8 — Android widgets

Deliverables:

- Native widget bridge.
- Coming up widget.
- Favorites widget.
- Responsive sizes, previews, empty states and deep links.
- Widget privacy behavior.

Exit criteria:

- Widgets update after relevant in-app changes.
- Widgets recover after device restart and app upgrade.
- Widget rendering is verified on multiple launchers and font scales.

### Phase 9 — Backup, security and beta hardening

Deliverables:

- Export and restore.
- Optional biometric lock.
- Error and recovery UX.
- Performance, accessibility and battery review.
- Privacy policy draft and in-app data explanation.
- Release configuration, signing checklist and closed-test build.

Exit criteria:

- A full export can restore into a clean installation.
- No sensitive values appear in logs or crash metadata.
- Critical user journeys pass on physical Android devices.

## 13. Testing strategy

### Unit tests

Prioritize:

- Reciprocal relationship mapping.
- Partial-date calculations.
- Reminder recurrence.
- Duplicate scoring.
- Merge decisions and invariants.
- Contact normalization.
- Localization formatting.

### Repository/integration tests

- Every migration from an earlier schema to the current schema.
- Transaction rollback during merge.
- Cascade/retention behavior for soft deletion.
- Full-text search indexing.
- Google payload mapping using stored sanitized fixtures.

### UI/end-to-end tests

- Create a person and add a note.
- Connect two people and inspect both profiles.
- Create a circle and assign a role.
- Create and snooze a reminder.
- Merge a local person with an imported fixture.
- Change language.
- Export and restore.

### Native tests/manual matrix

- Notification permission granted and denied.
- Device reboot and timezone change.
- Widgets at multiple sizes.
- Android font sizes and display scaling.
- Offline start.
- OAuth cancellation and revoked consent.

## 14. Privacy and security checklist

- Request only required Google scopes.
- Explain why each Android permission is needed immediately before requesting it.
- Keep OAuth tokens in secure platform storage.
- Encrypt particularly sensitive local material if the selected threat model requires it.
- Never store tokens in Pinia, plain preferences or logs.
- Redact personal fields from analytics and crash reports.
- Make analytics opt-in or omit analytics from the MVP.
- Support account disconnect without deleting local Kindy data.
- Document export contents and deletion behavior.
- Review GDPR obligations before public release, especially data export, deletion, retention and processor agreements.

## 15. Definition of done for every change

A change is complete when:

- Acceptance criteria are met.
- Type checking, linting and relevant tests pass.
- New user-visible text exists in English and Dutch.
- Loading, empty, error and permission-denied states are handled where relevant.
- Accessibility labels, keyboard/focus behavior where applicable and touch targets are checked.
- Database changes include a forward migration and migration test.
- No personal data is written to logs.
- Documentation or ADRs are updated when behavior or architecture changes.
- The change is verified on Android when it touches native behavior.

## 16. How to work with Codex

Use one scoped change at a time. A good change usually owns one coherent vertical slice and can be reviewed independently.

### Initial Codex prompt

```text
Read KINDY_PLAN.md completely before changing files.

Start Phase 0 for Kindy. Inspect the repository first and preserve existing work.
Create a concise implementation proposal covering:
- current repository state;
- recommended current stable versions and compatibility checks;
- decisions still required;
- proposed ADRs;
- the smallest first implementation change.

Do not scaffold or install dependencies yet. Cite official documentation for
time-sensitive technical choices. Finish with a list of files you propose to
create or modify and wait for approval.
```

### First implementation prompt

Use this after accepting the Phase 0 proposal:

```text
Read KINDY_PLAN.md and the accepted ADRs. Implement only the approved first
foundation change. Keep it reviewable and do not begin later phases.

Requirements:
- Vue 3 setup syntax with TypeScript strict mode;
- pnpm;
- English and Dutch localization from the start;
- automated tests for behavior introduced in this change;
- no hard-coded personal data outside test fixtures;
- update documentation and report verification commands and results.
```

### Example later prompts

```text
Implement the Person aggregate and SQLite repository from Phase 2. Include the
first schema migration, repository tests and typed domain interfaces. Do not
build Google import, notes, circles or relationships in this change.
```

```text
Implement local person creation and editing on top of the existing repository.
Use the current Kindy design tokens and i18n conventions. Include validation,
empty/error states and tests. Do not add Google import yet.
```

```text
Implement canonical parent/child, partner and sibling relationships from Phase
3. The inverse relationship must be derived correctly and self-relations must
be impossible. Include domain and repository tests before adding the visual
relationship overview.
```

```text
Perform the Google Contacts technical spike from Phase 5. Prove authentication,
read-only contact retrieval, birthday/event mapping and token storage on an
Android device. Keep this behind a development-only route and document findings;
do not build the final import UX yet.
```

## 17. Recommended first backlog

Create these as separate changes, in this order:

1. Repository assessment and ADR proposals.
2. Vue/TypeScript/Vite foundation with quality scripts.
3. Capacitor Android shell and physical-device smoke test.
4. English/Dutch i18n foundation.
5. Design tokens and base components.
6. Navigation shell with fixture screens.
7. SQLite selection spike and migration runner.
8. Person schema and repository.
9. Local person list.
10. Create/edit person flow.
11. Person profile and favorites.
12. Notes domain and UI.
13. Circles domain and UI.
14. Relationships domain and UI.
15. Important dates and Upcoming.
16. Reminders and notifications.
17. Google Contacts spike.
18. Google import and refresh.
19. Duplicate suggestions and merge.
20. Interactions and timeline.
21. Global search.
22. Coming up widget.
23. Favorites widget.
24. Export/restore and beta hardening.

## 18. Open decisions

Resolve these during Phase 0 or before their dependent phase:

- Minimum and target Android versions.
- Exact SQLite and secure-storage plugins.
- Whether photos are copied locally, cached or referenced remotely.
- Whether custom fields are global definitions or can also be person-specific.
- How long soft-deleted records remain restorable.
- Export format and whether attachments are packaged in a ZIP archive.
- Whether the first beta requires biometric lock.
- Whether Google contact groups become Kindy circles automatically or only as suggestions.
- Whether merge undo is guaranteed or explicitly best effort.
- Whether the MVP is strictly on-device or needs encrypted cloud backup before public release.

## 19. Success criteria for the first beta

The beta is successful when a user can:

1. Install Kindy and choose English or Dutch.
2. Add local people and import selected Google contacts.
3. Merge a pre-existing local person with the correct Google contact.
4. Store structured details and free-form notes.
5. See who belongs to whom through relationships and circles.
6. Favorite important people.
7. See birthdays, anniversaries and reminders in Upcoming.
8. Receive optional Android notifications.
9. Log a shared contact moment.
10. Use Coming up and Favorites home-screen widgets.
11. Export data and restore it into a clean installation.

The app should remain useful when offline, when Google access is revoked and when notification permission is denied.

