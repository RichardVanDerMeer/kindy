import { describe, expect, it } from 'vitest'

import { KINDY_SCHEMA_VERSION, type KindyData } from '@/domain/model'
import { personTimeline } from '@/domain/timeline'

function data(): KindyData {
  return {
    schemaVersion: KINDY_SCHEMA_VERSION,
    people: [
      {
        id: 'p',
        displayName: 'Robin',
        isFavorite: false,
        isArchived: false,
        isDeceased: false,
        contactPoints: [],
        details: [],
        createdAt: 0,
        updatedAt: 0,
        jobs: [
          { id: 'now', title: 'Designer', employer: 'Studio', startedOn: '2021-04' },
          { id: 'before', title: 'Intern', startedOn: '2019-09', endedOn: '2021-03' },
          { id: 'unknown', employer: 'Bakkerij' },
        ],
      },
    ],
    externalIdentities: [],
    circles: [],
    memberships: [],
    relationships: [],
    notes: [],
    events: [],
    reminders: [],
    reminderOccurrences: [],
    interactions: [],
    syncQueue: [],
    wishes: [],
    calendarLinks: [],
  }
}

describe('jobs on the timeline', () => {
  it('shows when each job began and ended, the current one included', () => {
    const { dated, undated } = personTimeline('p', data())
    expect(dated.map((entry) => [entry.kind, entry.title, entry.date])).toEqual([
      ['job-started', 'Designer · Studio', { year: 2021, month: 4, day: 1 }],
      ['job-ended', 'Intern', { year: 2021, month: 3, day: 1 }],
      ['job-started', 'Intern', { year: 2019, month: 9, day: 1 }],
    ])
    expect(undated.map((entry) => entry.title)).toEqual(['Bakkerij'])
  })
})
