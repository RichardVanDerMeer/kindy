import { calendarDay } from './agenda'
import type { EntityId, Interaction, KindyData, PartialDate } from './model'

export type TimelineKind =
  'born' | 'married' | 'anniversary' | 'died' | 'memo' | 'interaction' | 'appointment'

export interface TimelineEntry {
  id: string
  kind: TimelineKind
  date: PartialDate
  /** Other people involved, e.g. the partner on a wedding day. */
  otherPersonIds: EntityId[]
  title?: string
  interactionType?: Interaction['type']
}

function sortKey(date: PartialDate): number {
  return (date.year ?? 0) * 10_000 + date.month * 100 + date.day
}

/**
 * Life events and dated moments for one person, newest first. Entries whose
 * year is unknown cannot be placed in time and are returned separately.
 */
export function personTimeline(
  personId: EntityId,
  data: KindyData,
): { dated: TimelineEntry[]; undated: TimelineEntry[] } {
  const person = data.people.find((candidate) => candidate.id === personId)
  const entries: TimelineEntry[] = []
  if (!person) return { dated: [], undated: [] }

  if (person.birthDate) {
    entries.push({ id: 'born', kind: 'born', date: person.birthDate, otherPersonIds: [] })
  }
  for (const event of data.events) {
    if (!event.personIds.includes(personId)) continue
    if (event.type !== 'wedding-anniversary' && event.type !== 'anniversary') continue
    entries.push({
      id: event.id,
      kind: event.type === 'wedding-anniversary' ? 'married' : 'anniversary',
      date: event.date,
      otherPersonIds: event.personIds.filter((id) => id !== personId),
      title: event.title,
    })
  }
  if (person.isDeceased && person.deathDate) {
    entries.push({ id: 'died', kind: 'died', date: person.deathDate, otherPersonIds: [] })
  }
  for (const occurrence of data.reminderOccurrences) {
    const reminder = data.reminders.find((candidate) => candidate.id === occurrence.reminderId)
    if (!reminder || reminder.personId !== personId || reminder.isCancelled) continue
    if (occurrence.state === 'cancelled') continue
    entries.push({
      id: occurrence.id,
      kind: 'memo',
      date: calendarDay(new Date(occurrence.snoozedUntil ?? occurrence.dueAt)),
      otherPersonIds: [],
      title: reminder.title,
    })
  }
  for (const link of data.calendarLinks) {
    if (link.status !== 'linked' || !link.personIds.includes(personId)) continue
    entries.push({
      id: link.id,
      kind: 'appointment',
      date: calendarDay(new Date(link.startsAt)),
      otherPersonIds: link.personIds.filter((id) => id !== personId),
      title: link.title,
    })
  }
  for (const interaction of data.interactions) {
    if (!interaction.personIds.includes(personId)) continue
    entries.push({
      id: interaction.id,
      kind: 'interaction',
      date: calendarDay(new Date(interaction.occurredAt)),
      otherPersonIds: interaction.personIds.filter((id) => id !== personId),
      title: interaction.summary,
      interactionType: interaction.type,
    })
  }

  const byNewest = (left: TimelineEntry, right: TimelineEntry) =>
    sortKey(right.date) - sortKey(left.date)
  return {
    dated: entries.filter((entry) => entry.date.year !== null).sort(byNewest),
    undated: entries.filter((entry) => entry.date.year === null).sort(byNewest),
  }
}
