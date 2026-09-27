import type { AgendaItem } from '@/domain/agenda'
import type { Person } from '@/domain/model'

type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export const firstName = (person: Person) => person.givenName ?? person.displayName

/** Whole years as a number, a half year (12.5) as "12½". */
export function yearsText(years: number): string {
  return Number.isInteger(years) ? String(years) : `${Math.floor(years)}½`
}

/** The person an item is about: skip the user themselves, e.g. on a shared wedding day. */
export function primaryPerson(people: Person[]): Person | undefined {
  return people.find((person) => !person.isSelf) ?? people[0]
}

/**
 * Title and detail line for an agenda item, as shown in the app and on the
 * home-screen widget. `people` are the item's people, in order.
 */
export function describeAgendaItem(
  item: AgendaItem,
  people: Person[],
  t: Translate,
  locale: string,
): { title: string; detail: string } {
  const primary = primaryPerson(people)
  const title = t(`upcoming.kinds.${item.kind}`, {
    name: primary ? firstName(primary) : '',
    names: people.map(firstName).join(' & '),
    title: item.title ?? '',
  })

  let detail = ''
  if (item.kind === 'reminder') {
    detail = t('upcoming.details.reminder')
  } else if (item.kind === 'appointment') {
    const time = item.startsAt
      ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
          item.startsAt,
        )
      : t('calendar.allDay')
    detail = [time, item.location].filter(Boolean).join(' · ')
  } else if (item.kind === 'work-anniversary' && item.years) {
    detail = item.title
      ? t('upcoming.details.workAt', { years: yearsText(item.years), title: item.title })
      : t('upcoming.details.work-anniversary', { years: yearsText(item.years) })
  } else if (item.years) {
    detail = t(`upcoming.details.${item.kind}`, { count: item.years }, item.years)
  }
  return { title, detail }
}
