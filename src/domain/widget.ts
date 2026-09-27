import { agendaFilterFor, matchesAgendaFilters, type AgendaFilter, type AgendaItem } from './agenda'

/** What the "Coming up" home-screen widget shows; written by the app, read by Android. */
export interface ComingUpSnapshot {
  version: 1
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
  /** Opens this person when tapped. An opaque id, never a name. */
  personId?: string
}

export interface ComingUpPreferences {
  /** Empty means everything, like "All" in Upcoming. */
  filters: AgendaFilter[]
  hideNames: boolean
}

export const defaultComingUpPreferences: ComingUpPreferences = { filters: [], hideNames: false }

/** Enough for a few weeks without opening the app; the widget drops past days itself. */
const MAX_ITEMS = 20
const DAYS_AHEAD = 60

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
    .filter((item) => item.daysFromToday >= 0 && item.daysFromToday <= DAYS_AHEAD)
    .filter((item) => matchesAgendaFilters(item, selected))
    .slice(0, MAX_ITEMS)
    .map((item): ComingUpWidgetItem => {
      const kind = agendaFilterFor(item.kind)
      const text = options.describe(item)
      return options.hideNames
        ? { date: item.date, title: options.genericTitle(kind), kind, personId: text.personId }
        : {
            date: item.date,
            title: text.title,
            detail: text.detail || undefined,
            kind,
            personId: text.personId,
          }
    })
  return {
    version: 1,
    generatedAt: options.now,
    heading: options.heading,
    empty: options.empty,
    labels: options.labels,
    locale: options.locale,
    items,
  }
}
