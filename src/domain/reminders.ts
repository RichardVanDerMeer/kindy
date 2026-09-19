import { Temporal } from '@js-temporal/polyfill'

import type { Recurrence } from './model'

export function nextOccurrence(
  localDateTime: string,
  timezone: string,
  recurrence: Recurrence,
  afterEpochMs: number,
): number | null {
  let current = Temporal.PlainDateTime.from(localDateTime).toZonedDateTime(timezone)
  const after = Temporal.Instant.fromEpochMilliseconds(afterEpochMs)

  if (recurrence.kind === 'once') {
    return Temporal.Instant.compare(current.toInstant(), after) > 0
      ? current.toInstant().epochMilliseconds
      : null
  }

  for (let guard = 0; guard < 5000; guard += 1) {
    if (Temporal.Instant.compare(current.toInstant(), after) > 0) {
      if (recurrence.kind !== 'weekly' || recurrence.weekdays.includes(current.dayOfWeek)) {
        return current.toInstant().epochMilliseconds
      }
    }

    switch (recurrence.kind) {
      case 'daily':
        current = current.add({ days: recurrence.interval })
        break
      case 'weekly':
        current = current.add({ days: 1 })
        break
      case 'monthly':
        current = current.add({ months: recurrence.interval }).with({ day: recurrence.day })
        break
      case 'yearly':
        current = current
          .add({ years: recurrence.interval })
          .with({ month: recurrence.month, day: recurrence.day })
        break
    }
  }

  throw new Error('Could not determine the next reminder occurrence')
}
