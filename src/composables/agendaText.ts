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
 * The two lines of an agenda card: who it is about, then what it is.
 * Memos, appointments and own events lead with their own title.
 */
export function agendaCardText(
  item: AgendaItem,
  people: Person[],
  t: Translate,
  locale: string,
): { headline: string; subline: string } {
  const primary = primaryPerson(people)
  const what = t(`upcoming.cardKinds.${item.kind}`)
  const join = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(' · ')
  switch (item.kind) {
    case 'wedding-anniversary':
    case 'anniversary':
      return { headline: people.map(firstName).join(' & '), subline: what }
    case 'birthday':
      return { headline: primary ? firstName(primary) : '', subline: what }
    case 'work-anniversary':
      return { headline: primary ? firstName(primary) : '', subline: join(what, item.title) }
    case 'memorial-death':
    case 'memorial-birth':
      return {
        headline: primary ? firstName(primary) : '',
        subline: join(
          what,
          item.years
            ? t(`upcoming.cardDetails.${item.kind}`, { count: item.years }, item.years)
            : undefined,
        ),
      }
    case 'custom':
      return { headline: item.title ?? '', subline: people.map(firstName).join(' & ') || what }
    default: {
      const { title, detail } = describeAgendaItem(item, people, t, locale)
      return { headline: title, subline: detail }
    }
  }
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
