import type { ImportantEvent, PartialDate } from './model'

function sameCouple(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id))
}

function dateKey(date: PartialDate): number | null {
  return date.year === null ? null : date.year * 10_000 + date.month * 100 + date.day
}

/**
 * The divorce that ended this marriage, if any: a divorce of the same couple
 * dated after the wedding. People can have several marriages; a divorce only
 * ends the one with that partner, and a later remarriage of the same couple
 * starts a new, active marriage. Without years the order is unknown, and the
 * divorce is taken to end the marriage.
 */
export function divorceEnding(
  wedding: ImportantEvent,
  events: ImportantEvent[],
): ImportantEvent | undefined {
  if (wedding.type !== 'wedding-anniversary') return undefined
  const weddingKey = dateKey(wedding.date)
  return events.find((event) => {
    if (event.type !== 'divorce' || !sameCouple(event.personIds, wedding.personIds)) return false
    const divorceKey = dateKey(event.date)
    if (weddingKey === null || divorceKey === null) return true
    if (divorceKey <= weddingKey) return false
    // A remarriage of the same couple between wedding and divorce belongs to that later wedding.
    return !events.some(
      (other) =>
        other !== wedding &&
        other.type === 'wedding-anniversary' &&
        sameCouple(other.personIds, wedding.personIds) &&
        (dateKey(other.date) ?? 0) > weddingKey &&
        (dateKey(other.date) ?? 0) < divorceKey,
    )
  })
}
