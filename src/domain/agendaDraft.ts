import type { PartialDate } from './model'

/** Something the user adds from Upcoming or from a person's timeline. */
export type AgendaDraft =
  | { kind: 'memo'; personId: string; text: string; date: string }
  | { kind: 'birthday'; personId: string; date: PartialDate }
  | { kind: 'wedding'; personIds: string[]; date: PartialDate }
  | { kind: 'divorce'; personIds: string[]; date: PartialDate }
  | { kind: 'death'; personId: string; date: PartialDate }
  | { kind: 'custom'; personIds: string[]; title: string; date: PartialDate }
  | {
      kind: 'appointment'
      personIds: string[]
      title: string
      startsAt: number
      endsAt: number
      allDay: boolean
      location?: string
    }

export type AgendaDraftKind = AgendaDraft['kind']
