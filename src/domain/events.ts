import { partnerIds } from './connections'
import type { EntityId, ImportantEvent, KindyData, PartialDate } from './model'

function sameDate(left: PartialDate, right: PartialDate): boolean {
  return (
    left.month === right.month &&
    left.day === right.day &&
    (left.year === null || right.year === null || left.year === right.year)
  )
}

/**
 * Google's "anniversary" is the wedding day: Google Contacts shows it as such,
 * and Kindy writes wedding days to Google as "anniversary" (ADR 0001).
 */
export function isWeddingDay(event: ImportantEvent): boolean {
  return (
    event.type === 'wedding-anniversary' ||
    (event.type === 'anniversary' && event.source === 'google')
  )
}

/**
 * The dates as people expect to see them: an anniversary from Google is a
 * wedding day; a wedding day entered in Kindy replaces the same one read from
 * Google; and partners who share a wedding day see it once, with both names.
 * Stored data is not changed.
 */
export function effectiveEvents(
  data: Pick<KindyData, 'events' | 'relationships'>,
): ImportantEvent[] {
  const result: ImportantEvent[] = []
  const weddings: ImportantEvent[] = []

  // Kindy's own wedding days first, so they win over a copy from Google.
  const ordered = [...data.events].sort(
    (left, right) => Number(left.source === 'google') - Number(right.source === 'google'),
  )
  for (const event of ordered) {
    if (!isWeddingDay(event)) {
      result.push(event)
      continue
    }
    const wedding: ImportantEvent = { ...event, type: 'wedding-anniversary' }
    const couple = (personId: EntityId) => [personId, ...partnerIds(personId, data.relationships)]
    const match = weddings.find(
      (known) =>
        sameDate(known.date, wedding.date) &&
        wedding.personIds.some((personId) =>
          couple(personId).some((member) => known.personIds.includes(member)),
        ),
    )
    if (match) {
      // The same wedding: keep one, with everyone it belongs to.
      match.personIds = [...new Set([...match.personIds, ...wedding.personIds])]
      if (match.date.year === null && wedding.date.year !== null) match.date = wedding.date
      continue
    }
    weddings.push(wedding)
    result.push(wedding)
  }
  return result
}
