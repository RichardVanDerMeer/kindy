import { describe, expect, it } from 'vitest'

import { normalizeContactLabel } from '@/domain/contactLabels'
import { isCurrentJob, jobLabel, jobsOf } from '@/domain/jobs'
import { divorceEnding } from '@/domain/marriage'
import type { ImportantEvent, Person } from '@/domain/model'
import { socialDisplay, socialUrl } from '@/domain/social'

function event(
  id: string,
  type: ImportantEvent['type'],
  year: number | null,
  personIds = ['a', 'b'],
): ImportantEvent {
  return { id, type, title: id, date: { year, month: 6, day: 1 }, personIds, source: 'kindy' }
}

describe('marriages and divorces', () => {
  it('ends only the marriage with that partner', () => {
    const first = event('first', 'wedding-anniversary', 2000)
    const second = event('second', 'wedding-anniversary', 2015, ['a', 'c'])
    const divorce = event('divorce', 'divorce', 2010)
    const events = [first, second, divorce]
    expect(divorceEnding(first, events)?.id).toBe('divorce')
    expect(divorceEnding(second, events)).toBeUndefined()
  })

  it('keeps a remarriage of the same couple after the divorce', () => {
    const first = event('first', 'wedding-anniversary', 2000)
    const divorce = event('divorce', 'divorce', 2010)
    const again = event('again', 'wedding-anniversary', 2018)
    const events = [first, divorce, again]
    expect(divorceEnding(first, events)?.id).toBe('divorce')
    expect(divorceEnding(again, events)).toBeUndefined()
  })

  it('treats a divorce without a known year as ending the marriage', () => {
    const wedding = event('wedding', 'wedding-anniversary', null)
    expect(divorceEnding(wedding, [wedding, event('divorce', 'divorce', null)])?.id).toBe('divorce')
  })
})

describe('social links', () => {
  it('turns handles into profile links and keeps full URLs', () => {
    expect(socialUrl('instagram', '@robin.chen')).toBe('https://www.instagram.com/robin.chen')
    expect(socialUrl('linkedin', 'robin-chen')).toBe('https://www.linkedin.com/in/robin-chen')
    expect(socialUrl('x', 'https://x.com/robin')).toBe('https://x.com/robin')
    expect(socialUrl('website', 'robin.example')).toBe('https://robin.example/')
  })

  it('refuses anything that is not a web link', () => {
    expect(socialUrl('instagram', 'javascript:alert(1)')).toBeUndefined()
    expect(socialUrl('x', 'robin/../../evil')).toBeUndefined()
  })

  it('shows a short handle or domain', () => {
    expect(socialDisplay('instagram', 'robin.chen')).toBe('@robin.chen')
    expect(socialDisplay('linkedin', 'https://www.linkedin.com/in/robin-chen/')).toBe(
      'in/robin-chen',
    )
    expect(socialDisplay('website', 'https://www.robin.example/blog')).toBe('robin.example')
    expect(socialDisplay('Strava', 'https://www.strava.com/athletes/123')).toBe(
      'strava.com/athletes/123',
    )
    expect(socialDisplay('website', 'robin.example')).toBe('robin.example')
  })
})

describe('contact labels', () => {
  it('maps older Dutch labels onto Google types and keeps custom ones', () => {
    expect(normalizeContactLabel('Mobiel')).toBe('mobile')
    expect(normalizeContactLabel('Privé')).toBe('home')
    expect(normalizeContactLabel('Vakantiehuis')).toBe('Vakantiehuis')
    expect(normalizeContactLabel(undefined)).toBe('other')
  })
})

describe('jobs', () => {
  const person = {
    id: 'p',
    details: [
      { definitionId: 'occupation', value: 'Kok' },
      { definitionId: 'employer', value: 'De Zwaan' },
    ],
  } as unknown as Person

  it('reads the older occupation and employer details as one job', () => {
    const jobs = jobsOf(person)
    expect(jobs).toHaveLength(1)
    expect(jobLabel(jobs[0]!)).toBe('Kok · De Zwaan')
  })

  it('sorts newest first and knows which jobs are current', () => {
    const jobs = jobsOf({
      ...person,
      jobs: [
        { id: 'old', title: 'Stagiair', startedOn: '2010-01', endedOn: '2012-06' },
        { id: 'now', title: 'Chef', startedOn: '2020-03' },
      ],
    })
    expect(jobs.map((job) => job.id)).toEqual(['now', 'old'])
    const today = new Date(2026, 8, 27)
    expect(jobs.filter((job) => isCurrentJob(job, today)).map((job) => job.id)).toEqual(['now'])
    expect(isCurrentJob({ id: 'x', endedOn: '2026-09' }, today)).toBe(true)
  })
})
