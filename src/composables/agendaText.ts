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
): { headline: string; familyLine?: string; what: string; whatIsTitle: boolean } {
  const kind = t(`upcoming.cardKinds.${item.kind}`)
  const join = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(' · ')
  const time =
    item.kind === 'appointment'
      ? item.startsAt
        ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
            item.startsAt,
          )
        : t('calendar.allDay')
      : undefined

  // What happens: the kind of day, or the memo's or appointment's own title.
  let what: string
  let whatIsTitle = false
  switch (item.kind) {
    case 'work-anniversary':
      what = join(kind, item.title)
      break
    case 'memorial-death':
    case 'memorial-birth':
      what = join(
        kind,
        item.years
          ? t(`upcoming.cardDetails.${item.kind}`, { count: item.years }, item.years)
          : undefined,
      )
      break
    case 'reminder':
    case 'custom':
      what = item.title ?? kind
      whatIsTitle = Boolean(item.title)
      break
    case 'appointment':
      what = join(item.title, time)
      whatIsTitle = Boolean(item.title)
      break
    default:
      what = kind
  }

  // Who it is about: couples and appointments name everyone, the rest one person.
  const shared =
    item.kind === 'wedding-anniversary' ||
    item.kind === 'anniversary' ||
    item.kind === 'appointment' ||
    item.kind === 'custom'
  const primary = primaryPerson(people)
  const who = shared ? people : primary ? [primary] : []
  if (!who.length) {
    // Nobody linked: the title leads, with the kind (or the time) underneath.
    return {
      headline: item.title ?? kind,
      what: item.kind === 'appointment' ? join(time, item.location) : kind,
      whatIsTitle: false,
    }
  }
  const shown = who.slice(0, 2)
  const more = who.length - shown.length
  const families = [...new Set(shown.map((person) => person.familyName?.trim()).filter(Boolean))]
  return {
    headline: shown.map(firstName).join(' & ') + (more ? ` +${more}` : ''),
    familyLine: families.join(' & ') || undefined,
    what,
    whatIsTitle,
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
