import type { Job, Person } from './model'

/** A job counts as current when it has no end, or ends this month or later. */
export function isCurrentJob(job: Job, today: Date): boolean {
  if (!job.endedOn) return true
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  return job.endedOn >= month
}

/**
 * The person's jobs, newest first. People from before job history existed
 * had one "occupation" and "employer" detail; that is read as a single job.
 */
export function jobsOf(person: Person): Job[] {
  if (person.jobs) {
    return [...person.jobs].sort((left, right) =>
      (right.startedOn ?? '').localeCompare(left.startedOn ?? ''),
    )
  }
  const detail = (id: string) => {
    const value = person.details.find((item) => item.definitionId === id)?.value
    return value === undefined || value === '' ? undefined : String(value)
  }
  const title = detail('occupation')
  const employer = detail('employer')
  return title || employer ? [{ id: `legacy-${person.id}`, title, employer }] : []
}

/** "Product designer · Voorbeeldbedrijf", or whichever part is known. */
export function jobLabel(job: Job): string {
  return [job.title, job.employer].filter(Boolean).join(' · ')
}
