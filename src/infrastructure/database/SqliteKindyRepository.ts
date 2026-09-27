import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'

import { nextPartialDate } from '@/domain/dates'
import { normalizeText } from '@/domain/duplicates'
import type {
  Circle,
  CircleMembership,
  ExternalIdentity,
  ImportantEvent,
  Interaction,
  KindyData,
  Note,
  Person,
  Relationship,
  Reminder,
  ReminderOccurrence,
  SyncOperation,
  UpcomingItem,
} from '@/domain/model'
import type { KindyRepository } from '@/domain/ports'
import { getSecurityGateway } from '@/infrastructure/security/securityGateway'

import { DATABASE_NAME, DATABASE_VERSION, migrations } from './migrations'

type SqlRow = Record<string, unknown>

function bool(value: unknown): boolean {
  return Number(value) === 1
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value)
}

function optionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value)
}

function rows(result: { values?: unknown[] }): SqlRow[] {
  return (result.values ?? []) as SqlRow[]
}

export class SqliteKindyRepository implements KindyRepository {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite)
  private database?: SQLiteDBConnection

  async initialize(): Promise<void> {
    const secret = await this.sqlite.isSecretStored()
    if (!secret.result) {
      const passphrase = await getSecurityGateway().getDatabasePassphrase()
      await this.sqlite.setEncryptionSecret(passphrase)
    }

    await this.sqlite.addUpgradeStatement(DATABASE_NAME, migrations)
    const connectionState = await this.sqlite.isConnection(DATABASE_NAME, false)
    this.database = connectionState.result
      ? await this.sqlite.retrieveConnection(DATABASE_NAME, false)
      : await this.sqlite.createConnection(DATABASE_NAME, true, 'secret', DATABASE_VERSION, false)
    await this.database.open()
    await this.database.execute('PRAGMA foreign_keys = ON;', false)
  }

  async close(): Promise<void> {
    if (!this.database) return
    await this.database.close()
    await this.sqlite.closeConnection(DATABASE_NAME, false)
    this.database = undefined
  }

  async getData(): Promise<KindyData> {
    const db = this.requireDatabase()
    const [
      peopleRows,
      externalIdentityRows,
      contactRows,
      detailRows,
      circleRows,
      membershipRows,
      relationshipRows,
      noteRows,
      notePeopleRows,
      eventRows,
      eventPeopleRows,
      reminderRows,
      occurrenceRows,
      interactionRows,
      interactionPeopleRows,
      syncOperationRows,
    ] = await Promise.all([
      db.query('SELECT * FROM people'),
      db.query('SELECT * FROM external_identities'),
      db.query('SELECT * FROM contact_points'),
      db.query('SELECT * FROM person_details'),
      db.query('SELECT * FROM circles'),
      db.query('SELECT * FROM circle_memberships'),
      db.query('SELECT * FROM relationships'),
      db.query('SELECT * FROM notes'),
      db.query('SELECT * FROM note_people'),
      db.query('SELECT * FROM important_events'),
      db.query('SELECT * FROM event_people'),
      db.query('SELECT * FROM reminders'),
      db.query('SELECT * FROM reminder_occurrences'),
      db.query('SELECT * FROM interactions'),
      db.query('SELECT * FROM interaction_people'),
      db.query('SELECT * FROM sync_operations'),
    ])

    const contactPoints = rows(contactRows)
    const details = rows(detailRows)
    const notePeople = rows(notePeopleRows)
    const eventPeople = rows(eventPeopleRows)
    const interactionPeople = rows(interactionPeopleRows)

    const people: Person[] = rows(peopleRows).map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name),
      givenName: optionalString(row.given_name),
      middleName: optionalString(row.middle_name),
      familyName: optionalString(row.family_name),
      nickname: optionalString(row.nickname),
      pronouns: optionalString(row.pronouns),
      photoRef: optionalString(row.photo_ref),
      isSelf: bool(row.is_self) || undefined,
      isFavorite: bool(row.is_favorite),
      isArchived: bool(row.is_archived),
      isDeceased: bool(row.is_deceased),
      birthDate:
        row.birth_month == null || row.birth_day == null
          ? undefined
          : {
              year: optionalNumber(row.birth_year) ?? null,
              month: Number(row.birth_month),
              day: Number(row.birth_day),
            },
      deathDate:
        row.death_month == null || row.death_day == null
          ? undefined
          : {
              year: optionalNumber(row.death_year) ?? null,
              month: Number(row.death_month),
              day: Number(row.death_day),
            },
      memorialNote: optionalString(row.memorial_note),
      howWeMet: optionalString(row.how_we_met),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      deletedAt: optionalNumber(row.deleted_at),
      contactPoints: contactPoints
        .filter((point) => point.person_id === row.id)
        .map((point) => ({
          id: String(point.id),
          kind: String(point.kind) as Person['contactPoints'][number]['kind'],
          label: String(point.label),
          value: String(point.value),
          normalizedValue: String(point.normalized_value),
          isPrimary: bool(point.is_primary),
          source: String(point.source) as Person['contactPoints'][number]['source'],
          sourceFieldId: optionalString(point.source_field_id),
        })),
      details: details
        .filter((detail) => detail.person_id === row.id)
        .map((detail) => ({
          id: String(detail.id),
          definitionId: String(detail.definition_id),
          label: String(detail.label),
          value: JSON.parse(String(detail.value_json)) as string | number | boolean,
          valueType: String(detail.value_type) as Person['details'][number]['valueType'],
          source: String(detail.source) as Person['details'][number]['source'],
          observedAt: optionalNumber(detail.observed_at),
        })),
    }))

    const externalIdentities: ExternalIdentity[] = rows(externalIdentityRows).map((row) => ({
      id: String(row.id),
      personId: String(row.person_id),
      provider: String(row.provider) as ExternalIdentity['provider'],
      providerAccountId: String(row.provider_account_id),
      providerResourceId: String(row.provider_resource_id),
      etag: optionalString(row.etag),
      lastSyncedAt: optionalNumber(row.last_synced_at),
      remoteDeletedAt: optionalNumber(row.remote_deleted_at),
      writtenFields:
        row.written_fields_json == null
          ? undefined
          : (JSON.parse(String(row.written_fields_json)) as ExternalIdentity['writtenFields']),
    }))

    const syncQueue: SyncOperation[] = rows(syncOperationRows).map((row) => ({
      id: String(row.id),
      personId: String(row.person_id),
      kind: String(row.kind) as SyncOperation['kind'],
      state: String(row.state) as SyncOperation['state'],
      attempts: Number(row.attempts),
      lastError: optionalString(row.last_error),
      updatedAt: Number(row.updated_at),
    }))

    const circles: Circle[] = rows(circleRows).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      description: optionalString(row.description),
      colorToken: String(row.color_token) as Circle['colorToken'],
      iconKey: String(row.icon_key),
      backgroundImageRef: optionalString(row.background_ref),
      isFavorite: bool(row.is_favorite),
      isArchived: bool(row.is_archived),
    }))

    const memberships: CircleMembership[] = rows(membershipRows).map((row) => ({
      circleId: String(row.circle_id),
      personId: String(row.person_id),
      role: optionalString(row.role),
      startedOn: optionalString(row.started_on),
      endedOn: optionalString(row.ended_on),
    }))

    const relationships: Relationship[] = rows(relationshipRows).map((row) => ({
      id: String(row.id),
      fromPersonId: String(row.from_person_id),
      toPersonId: String(row.to_person_id),
      type: String(row.type) as Relationship['type'],
      customLabel: optionalString(row.custom_label),
      fromPersonLabel: optionalString(row.from_person_label),
      toPersonLabel: optionalString(row.to_person_label),
      fromPersonRole: optionalString(row.from_person_role) as Relationship['fromPersonRole'],
      toPersonRole: optionalString(row.to_person_role) as Relationship['toPersonRole'],
      startedOn: optionalString(row.started_on),
      endedOn: optionalString(row.ended_on),
      note: optionalString(row.note),
    }))

    const notes: Note[] = rows(noteRows).map((row) => ({
      id: String(row.id),
      body: String(row.body),
      personIds: notePeople
        .filter((join) => join.note_id === row.id)
        .map((join) => String(join.person_id)),
      occurredAt: Number(row.occurred_at),
      isPinned: bool(row.is_pinned),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }))

    const events: ImportantEvent[] = rows(eventRows).map((row) => ({
      id: String(row.id),
      type: String(row.type) as ImportantEvent['type'],
      title: String(row.title),
      date: {
        year:
          row.event_year === null || row.event_year === undefined ? null : Number(row.event_year),
        month: Number(row.event_month),
        day: Number(row.event_day),
      },
      personIds: eventPeople
        .filter((join) => join.event_id === row.id)
        .map((join) => String(join.person_id)),
      source: String(row.source) as ImportantEvent['source'],
      externalSourceRef: optionalString(row.external_source_ref),
    }))

    const reminders: Reminder[] = rows(reminderRows).map((row) => ({
      id: String(row.id),
      personId: optionalString(row.person_id),
      noteId: optionalString(row.note_id),
      eventId: optionalString(row.event_id),
      interactionId: optionalString(row.interaction_id),
      title: String(row.title),
      description: optionalString(row.description),
      localDateTime: String(row.local_date_time),
      timezone: String(row.timezone),
      recurrence: JSON.parse(String(row.recurrence_json)) as Reminder['recurrence'],
      notificationOffsetsMinutes: JSON.parse(String(row.notification_offsets_json)) as number[],
      isCancelled: bool(row.is_cancelled),
    }))

    const reminderOccurrences: ReminderOccurrence[] = rows(occurrenceRows).map((row) => ({
      id: String(row.id),
      reminderId: String(row.reminder_id),
      dueAt: Number(row.due_at),
      state: String(row.state) as ReminderOccurrence['state'],
      snoozedUntil: optionalNumber(row.snoozed_until),
    }))

    const interactions: Interaction[] = rows(interactionRows).map((row) => ({
      id: String(row.id),
      type: String(row.type) as Interaction['type'],
      personIds: interactionPeople
        .filter((join) => join.interaction_id === row.id)
        .map((join) => String(join.person_id)),
      occurredAt: Number(row.occurred_at),
      location: optionalString(row.location),
      summary: optionalString(row.summary),
    }))

    return {
      schemaVersion: DATABASE_VERSION,
      people,
      externalIdentities,
      circles,
      memberships,
      relationships,
      notes,
      events,
      reminders,
      reminderOccurrences,
      interactions,
      syncQueue,
    }
  }

  async replaceData(data: KindyData): Promise<void> {
    const db = this.requireDatabase()
    await db.beginTransaction()
    try {
      await db.execute(
        `DELETE FROM search_index;
         DELETE FROM sync_operations;
         DELETE FROM external_identities;
         DELETE FROM interaction_people;
         DELETE FROM interactions;
         DELETE FROM reminder_occurrences;
         DELETE FROM reminders;
         DELETE FROM event_people;
         DELETE FROM important_events;
         DELETE FROM relationships;
         DELETE FROM note_people;
         DELETE FROM notes;
         DELETE FROM circle_memberships;
         DELETE FROM circles;
         DELETE FROM person_details;
         DELETE FROM contact_points;
         DELETE FROM people;`,
        false,
      )
      for (const person of data.people) await this.writePerson(person)
      for (const identity of data.externalIdentities) {
        await db.run(
          'INSERT INTO external_identities(id,person_id,provider,provider_account_id,provider_resource_id,etag,last_synced_at,remote_deleted_at,written_fields_json) VALUES(?,?,?,?,?,?,?,?,?)',
          [
            identity.id,
            identity.personId,
            identity.provider,
            identity.providerAccountId,
            identity.providerResourceId,
            identity.etag ?? null,
            identity.lastSyncedAt ?? null,
            identity.remoteDeletedAt ?? null,
            identity.writtenFields ? JSON.stringify(identity.writtenFields) : null,
          ],
          false,
        )
      }
      for (const circle of data.circles) {
        await db.run(
          'INSERT INTO circles(id,name,description,color_token,icon_key,background_ref,is_favorite,is_archived) VALUES(?,?,?,?,?,?,?,?)',
          [
            circle.id,
            circle.name,
            circle.description ?? null,
            circle.colorToken,
            circle.iconKey,
            circle.backgroundImageRef ?? null,
            Number(circle.isFavorite),
            Number(circle.isArchived),
          ],
          false,
        )
      }
      for (const membership of data.memberships) {
        await db.run(
          'INSERT INTO circle_memberships(circle_id,person_id,role,started_on,ended_on) VALUES(?,?,?,?,?)',
          [
            membership.circleId,
            membership.personId,
            membership.role ?? null,
            membership.startedOn ?? null,
            membership.endedOn ?? null,
          ],
          false,
        )
      }
      for (const relationship of data.relationships) {
        await db.run(
          'INSERT INTO relationships(id,from_person_id,to_person_id,type,custom_label,from_person_label,to_person_label,from_person_role,to_person_role,started_on,ended_on,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          [
            relationship.id,
            relationship.fromPersonId,
            relationship.toPersonId,
            relationship.type,
            relationship.customLabel ?? null,
            relationship.fromPersonLabel ?? null,
            relationship.toPersonLabel ?? null,
            relationship.fromPersonRole ?? null,
            relationship.toPersonRole ?? null,
            relationship.startedOn ?? null,
            relationship.endedOn ?? null,
            relationship.note ?? null,
          ],
          false,
        )
      }
      for (const note of data.notes) {
        await db.run(
          'INSERT INTO notes(id,body,occurred_at,is_pinned,created_at,updated_at) VALUES(?,?,?,?,?,?)',
          [
            note.id,
            note.body,
            note.occurredAt,
            Number(note.isPinned),
            note.createdAt,
            note.updatedAt,
          ],
          false,
        )
        for (const personId of note.personIds) {
          await db.run(
            'INSERT INTO note_people(note_id,person_id) VALUES(?,?)',
            [note.id, personId],
            false,
          )
        }
      }
      for (const event of data.events) {
        await db.run(
          'INSERT INTO important_events(id,type,title,event_year,event_month,event_day,source,external_source_ref) VALUES(?,?,?,?,?,?,?,?)',
          [
            event.id,
            event.type,
            event.title,
            event.date.year,
            event.date.month,
            event.date.day,
            event.source,
            event.externalSourceRef ?? null,
          ],
          false,
        )
        for (const personId of event.personIds) {
          await db.run(
            'INSERT INTO event_people(event_id,person_id) VALUES(?,?)',
            [event.id, personId],
            false,
          )
        }
      }
      for (const interaction of data.interactions) {
        await db.run(
          'INSERT INTO interactions(id,type,occurred_at,location,summary) VALUES(?,?,?,?,?)',
          [
            interaction.id,
            interaction.type,
            interaction.occurredAt,
            interaction.location ?? null,
            interaction.summary ?? null,
          ],
          false,
        )
        for (const personId of interaction.personIds) {
          await db.run(
            'INSERT INTO interaction_people(interaction_id,person_id) VALUES(?,?)',
            [interaction.id, personId],
            false,
          )
        }
      }
      for (const reminder of data.reminders) {
        await db.run(
          'INSERT INTO reminders(id,person_id,note_id,event_id,interaction_id,title,description,local_date_time,timezone,recurrence_json,notification_offsets_json,is_cancelled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          [
            reminder.id,
            reminder.personId ?? null,
            reminder.noteId ?? null,
            reminder.eventId ?? null,
            reminder.interactionId ?? null,
            reminder.title,
            reminder.description ?? null,
            reminder.localDateTime,
            reminder.timezone,
            JSON.stringify(reminder.recurrence),
            JSON.stringify(reminder.notificationOffsetsMinutes),
            Number(reminder.isCancelled),
          ],
          false,
        )
      }
      for (const occurrence of data.reminderOccurrences) {
        await db.run(
          'INSERT INTO reminder_occurrences(id,reminder_id,due_at,state,snoozed_until) VALUES(?,?,?,?,?)',
          [
            occurrence.id,
            occurrence.reminderId,
            occurrence.dueAt,
            occurrence.state,
            occurrence.snoozedUntil ?? null,
          ],
          false,
        )
      }
      for (const operation of data.syncQueue) {
        await db.run(
          'INSERT INTO sync_operations(id,person_id,kind,state,attempts,last_error,updated_at) VALUES(?,?,?,?,?,?,?)',
          [
            operation.id,
            operation.personId,
            operation.kind,
            operation.state,
            operation.attempts,
            operation.lastError ?? null,
            operation.updatedAt,
          ],
          false,
        )
      }
      await this.rebuildSearchIndex(data)
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
  }

  async listPeople(
    options: { includeArchived?: boolean; includeDeleted?: boolean } = {},
  ): Promise<Person[]> {
    const data = await this.getData()
    return data.people
      .filter((person) => options.includeArchived || !person.isArchived)
      .filter((person) => options.includeDeleted || !person.deletedAt)
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
  }

  async getPerson(id: string): Promise<Person | null> {
    return (await this.getData()).people.find((person) => person.id === id) ?? null
  }

  async savePerson(person: Person): Promise<void> {
    const db = this.requireDatabase()
    await db.beginTransaction()
    try {
      await this.writePerson(person)
      const data = await this.getData()
      await this.rebuildSearchIndex(data)
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
  }

  async softDeletePerson(id: string, deletedAt: number): Promise<void> {
    await this.requireDatabase().run(
      'UPDATE people SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [deletedAt, deletedAt, id],
    )
  }

  async restorePerson(id: string): Promise<void> {
    await this.requireDatabase().run(
      'UPDATE people SET deleted_at = NULL, updated_at = ? WHERE id = ?',
      [Date.now(), id],
    )
  }

  async listCircles(): Promise<Circle[]> {
    return (await this.getData()).circles.filter((circle) => !circle.isArchived)
  }

  async listRelationships(personId: string): Promise<Relationship[]> {
    return (await this.getData()).relationships.filter(
      (relationship) =>
        relationship.fromPersonId === personId || relationship.toPersonId === personId,
    )
  }

  async listNotes(personId: string): Promise<Note[]> {
    return (await this.getData()).notes.filter((note) => note.personIds.includes(personId))
  }

  async listEvents(): Promise<ImportantEvent[]> {
    return (await this.getData()).events
  }

  async listReminders(): Promise<Reminder[]> {
    return (await this.getData()).reminders
  }

  async listInteractions(personId: string): Promise<Interaction[]> {
    return (await this.getData()).interactions.filter((interaction) =>
      interaction.personIds.includes(personId),
    )
  }

  async listUpcoming(now: number, limit = 20): Promise<UpcomingItem[]> {
    const data = await this.getData()
    const events: UpcomingItem[] = data.events.map((event) => ({
      id: event.id,
      kind: 'event',
      title: event.title,
      subtitle: event.type,
      dueAt: nextPartialDate(event.date, new Date(now)).getTime(),
      personIds: event.personIds,
    }))
    const reminders: UpcomingItem[] = data.reminderOccurrences
      .filter((occurrence) => occurrence.state === 'scheduled')
      .map((occurrence) => {
        const reminder = data.reminders.find((candidate) => candidate.id === occurrence.reminderId)
        return {
          id: occurrence.id,
          kind: 'reminder' as const,
          title: reminder?.title ?? 'Reminder',
          subtitle: 'reminder',
          dueAt: occurrence.snoozedUntil ?? occurrence.dueAt,
          personIds: reminder?.personId ? [reminder.personId] : [],
        }
      })
    return [...events, ...reminders]
      .filter((item) => item.dueAt >= now)
      .sort((left, right) => left.dueAt - right.dueAt)
      .slice(0, limit)
  }

  async search(query: string): Promise<Person[]> {
    const tokens = normalizeText(query).split(' ').filter(Boolean)
    if (!tokens.length) return this.listPeople()
    const match = tokens.map((token) => `${token.replace(/[^a-z0-9]/g, '')}*`).join(' AND ')
    const result = await this.requireDatabase().query(
      'SELECT entity_id FROM search_index WHERE search_index MATCH ?',
      [match],
    )
    const ids = new Set(rows(result).map((row) => String(row.entity_id)))
    return (await this.listPeople()).filter((person) => ids.has(person.id))
  }

  private async writePerson(person: Person): Promise<void> {
    const db = this.requireDatabase()
    await db.run(
      `INSERT INTO people(id,display_name,given_name,middle_name,family_name,nickname,pronouns,photo_ref,is_self,is_favorite,is_archived,is_deceased,birth_year,birth_month,birth_day,death_year,death_month,death_day,memorial_note,how_we_met,created_at,updated_at,deleted_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,given_name=excluded.given_name,middle_name=excluded.middle_name,family_name=excluded.family_name,nickname=excluded.nickname,pronouns=excluded.pronouns,photo_ref=excluded.photo_ref,is_self=excluded.is_self,is_favorite=excluded.is_favorite,is_archived=excluded.is_archived,is_deceased=excluded.is_deceased,birth_year=excluded.birth_year,birth_month=excluded.birth_month,birth_day=excluded.birth_day,death_year=excluded.death_year,death_month=excluded.death_month,death_day=excluded.death_day,memorial_note=excluded.memorial_note,how_we_met=excluded.how_we_met,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at`,
      [
        person.id,
        person.displayName,
        person.givenName ?? null,
        person.middleName ?? null,
        person.familyName ?? null,
        person.nickname ?? null,
        person.pronouns ?? null,
        person.photoRef ?? null,
        Number(person.isSelf ?? false),
        Number(person.isFavorite),
        Number(person.isArchived),
        Number(person.isDeceased),
        person.birthDate?.year ?? null,
        person.birthDate?.month ?? null,
        person.birthDate?.day ?? null,
        person.deathDate?.year ?? null,
        person.deathDate?.month ?? null,
        person.deathDate?.day ?? null,
        person.memorialNote ?? null,
        person.howWeMet ?? null,
        person.createdAt,
        person.updatedAt,
        person.deletedAt ?? null,
      ],
      false,
    )
    await db.run('DELETE FROM contact_points WHERE person_id = ?', [person.id], false)
    await db.run('DELETE FROM person_details WHERE person_id = ?', [person.id], false)
    for (const point of person.contactPoints) {
      await db.run(
        'INSERT INTO contact_points(id,person_id,kind,label,value,normalized_value,is_primary,source,source_field_id) VALUES(?,?,?,?,?,?,?,?,?)',
        [
          point.id,
          person.id,
          point.kind,
          point.label,
          point.value,
          point.normalizedValue,
          Number(point.isPrimary),
          point.source,
          point.sourceFieldId ?? null,
        ],
        false,
      )
    }
    for (const detail of person.details) {
      await db.run(
        'INSERT INTO person_details(id,person_id,definition_id,label,value_json,value_type,source,observed_at) VALUES(?,?,?,?,?,?,?,?)',
        [
          detail.id,
          person.id,
          detail.definitionId,
          detail.label,
          JSON.stringify(detail.value),
          detail.valueType,
          detail.source,
          detail.observedAt ?? null,
        ],
        false,
      )
    }
  }

  private async rebuildSearchIndex(data: KindyData): Promise<void> {
    const db = this.requireDatabase()
    await db.run('DELETE FROM search_index', [], false)
    for (const person of data.people.filter((candidate) => !candidate.deletedAt)) {
      const notes = data.notes
        .filter((note) => note.personIds.includes(person.id))
        .map((note) => note.body)
      const circleTerms = data.memberships
        .filter((membership) => membership.personId === person.id)
        .flatMap((membership) => {
          const circle = data.circles.find((candidate) => candidate.id === membership.circleId)
          return [circle?.name, membership.role]
        })
      const content = [
        person.nickname,
        person.howWeMet,
        ...person.contactPoints.map((point) => point.value),
        ...person.details.flatMap((detail) => [detail.label, String(detail.value)]),
        ...notes,
        ...circleTerms,
      ]
        .filter(Boolean)
        .join(' ')
      await db.run(
        'INSERT INTO search_index(entity_id,display_name,content) VALUES(?,?,?)',
        [person.id, person.displayName, content],
        false,
      )
    }
  }

  private requireDatabase(): SQLiteDBConnection {
    if (!this.database) throw new Error('Kindy database is not initialized')
    return this.database
  }
}
