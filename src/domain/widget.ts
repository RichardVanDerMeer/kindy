import { agendaFilterFor, matchesAgendaFilters, type AgendaFilter, type AgendaItem } from './agenda'

/** What the "Coming up" home-screen widget shows; written by the app, read by Android. */
export interface ComingUpSnapshot {
  version: 2
  generatedAt: number
  heading: string
  empty: string
  labels: { today: string; tomorrow: string }
  locale: string
  items: ComingUpWidgetItem[]
}

export interface ComingUpWidgetItem {
  /** Local calendar day, YYYY-MM-DD; the widget works out "today" and "tomorrow" itself. */
  date: string
  title: string
  detail?: string
  kind: AgendaFilter
  /** The type in words ("Birthday", "Appointment"), shown above the title. */
  kindLabel: string
  /** Opens this person when tapped. An opaque id, never a name. */
  personId?: string
}

export interface ComingUpPreferences {
  /** Empty means everything, like "All" in Upcoming. */
  filters: AgendaFilter[]
  hideNames: boolean
}

export const defaultComingUpPreferences: ComingUpPreferences = { filters: [], hideNames: false }

/** Two months ahead; the widget scrolls and drops past days itself. */
const MAX_ITEMS = 40
const DAYS_AHEAD = 62

/**
 * Builds the widget snapshot from the agenda. With `hideNames` (chosen by the
 * user, or forced by the app lock) titles become generic ("Birthday") and
 * detail lines are left out, so no names or places reach the home screen.
 */
export function buildComingUpSnapshot(
  agenda: AgendaItem[],
  options: {
    preferences: ComingUpPreferences
    hideNames: boolean
    describe: (item: AgendaItem) => { title: string; detail: string; personId?: string }
    genericTitle: (filter: AgendaFilter) => string
    heading: string
    empty: string
    labels: { today: string; tomorrow: string }
    locale: string
    now: number
  },
): ComingUpSnapshot {
  const selected = new Set(options.preferences.filters)
  const items = agenda
    .filter((item) => item.daysFromToday >= 0 && item.daysFromToday <= DAYS_AHEAD && !item.done)
    .filter((item) => matchesAgendaFilters(item, selected))
    .slice(0, MAX_ITEMS)
    .map((item): ComingUpWidgetItem => {
      const kind = agendaFilterFor(item.kind)
      const text = options.describe(item)
      const kindLabel = options.genericTitle(kind)
      return options.hideNames
        ? { date: item.date, title: kindLabel, kind, kindLabel, personId: text.personId }
        : {
            date: item.date,
            title: text.title,
            detail: text.detail || undefined,
            kind,
            kindLabel,
            personId: text.personId,
          }
    })
  return {
    version: 2,
    generatedAt: options.now,
    heading: options.heading,
    empty: options.empty,
    labels: options.labels,
    locale: options.locale,
    items,
  }
}
