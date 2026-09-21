import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite'

export const DATABASE_NAME = 'kindy'
export const DATABASE_VERSION = 3

const migrationOne = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  given_name TEXT,
  middle_name TEXT,
  family_name TEXT,
  nickname TEXT,
  pronouns TEXT,
  photo_ref TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  is_deceased INTEGER NOT NULL DEFAULT 0 CHECK (is_deceased IN (0, 1)),
  how_we_met TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS external_identities (
  id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_resource_id TEXT NOT NULL,
  etag TEXT,
  last_synced_at INTEGER,
  remote_deleted_at INTEGER,
  UNIQUE(provider, provider_account_id, provider_resource_id)
);

CREATE TABLE IF NOT EXISTS contact_points (
  id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  source_field_id TEXT
);
CREATE INDEX IF NOT EXISTS contact_points_normalized_idx ON contact_points(normalized_value);

CREATE TABLE IF NOT EXISTS field_definitions (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  value_type TEXT NOT NULL,
  choice_options_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS person_details (
  id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  definition_id TEXT NOT NULL,
  label TEXT NOT NULL,
  value_json TEXT NOT NULL,
  value_type TEXT NOT NULL,
  source TEXT NOT NULL,
  observed_at INTEGER
);

CREATE TABLE IF NOT EXISTS remote_field_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  external_identity_id TEXT NOT NULL REFERENCES external_identities(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  remote_value_json TEXT NOT NULL,
  remote_hash TEXT NOT NULL,
  local_hash_at_sync TEXT,
  synced_at INTEGER NOT NULL,
  UNIQUE(external_identity_id, field_path)
);

CREATE TABLE IF NOT EXISTS circles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color_token TEXT NOT NULL,
  icon_key TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS circle_memberships (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role TEXT,
  started_on TEXT,
  ended_on TEXT,
  PRIMARY KEY(circle_id, person_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL,
  body TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS note_people (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY(note_id, person_id)
);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY NOT NULL,
  from_person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  to_person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  custom_label TEXT,
  started_on TEXT,
  ended_on TEXT,
  note TEXT,
  CHECK(from_person_id <> to_person_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS active_relationship_idx
  ON relationships(from_person_id, to_person_id, type)
  WHERE ended_on IS NULL;

CREATE TABLE IF NOT EXISTS important_events (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  event_year INTEGER,
  event_month INTEGER NOT NULL CHECK(event_month BETWEEN 1 AND 12),
  event_day INTEGER NOT NULL CHECK(event_day BETWEEN 1 AND 31),
  source TEXT NOT NULL,
  external_source_ref TEXT
);

CREATE TABLE IF NOT EXISTS event_people (
  event_id TEXT NOT NULL REFERENCES important_events(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY(event_id, person_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  event_id TEXT REFERENCES important_events(id) ON DELETE SET NULL,
  interaction_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  local_date_time TEXT NOT NULL,
  timezone TEXT NOT NULL,
  recurrence_json TEXT NOT NULL,
  notification_offsets_json TEXT NOT NULL,
  is_cancelled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reminder_occurrences (
  id TEXT PRIMARY KEY NOT NULL,
  reminder_id TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  due_at INTEGER NOT NULL,
  state TEXT NOT NULL,
  snoozed_until INTEGER,
  UNIQUE(reminder_id, due_at)
);
CREATE INDEX IF NOT EXISTS reminder_occurrences_due_idx ON reminder_occurrences(state, due_at);

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  location TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS interaction_people (
  interaction_id TEXT NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY(interaction_id, person_id)
);

CREATE TABLE IF NOT EXISTS merge_records (
  id TEXT PRIMARY KEY NOT NULL,
  source_person_id TEXT NOT NULL,
  target_person_id TEXT NOT NULL,
  merged_at INTEGER NOT NULL,
  source_snapshot_json TEXT NOT NULL,
  decisions_json TEXT NOT NULL,
  moved_entities_json TEXT NOT NULL,
  undone_at INTEGER
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity_id UNINDEXED,
  display_name,
  content,
  tokenize = 'unicode61 remove_diacritics 2'
);
`

const migrationTwo = `
ALTER TABLE people ADD COLUMN birth_year INTEGER;
ALTER TABLE people ADD COLUMN birth_month INTEGER CHECK(birth_month BETWEEN 1 AND 12);
ALTER TABLE people ADD COLUMN birth_day INTEGER CHECK(birth_day BETWEEN 1 AND 31);
ALTER TABLE people ADD COLUMN death_year INTEGER;
ALTER TABLE people ADD COLUMN death_month INTEGER CHECK(death_month BETWEEN 1 AND 12);
ALTER TABLE people ADD COLUMN death_day INTEGER CHECK(death_day BETWEEN 1 AND 31);
ALTER TABLE people ADD COLUMN memorial_note TEXT;
`

const migrationThree = `
ALTER TABLE relationships ADD COLUMN from_person_label TEXT;
ALTER TABLE relationships ADD COLUMN to_person_label TEXT;
`

export const migrations: capSQLiteVersionUpgrade[] = [
  {
    toVersion: 1,
    statements: [migrationOne],
  },
  {
    toVersion: 2,
    statements: [migrationTwo],
  },
  {
    toVersion: 3,
    statements: [migrationThree],
  },
]
