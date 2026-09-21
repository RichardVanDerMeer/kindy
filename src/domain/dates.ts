import type { PartialDate } from './model'

export function isValidPartialDate(date: PartialDate): boolean {
  if (!Number.isInteger(date.month) || !Number.isInteger(date.day)) return false
  if (date.month < 1 || date.month > 12 || date.day < 1) return false
  const validationYear = date.year ?? (date.month === 2 && date.day === 29 ? 2024 : 2025)
  const candidate = new Date(Date.UTC(validationYear, date.month - 1, date.day))
  return candidate.getUTCMonth() === date.month - 1 && candidate.getUTCDate() === date.day
}

export function nextPartialDate(date: PartialDate, from: Date): Date {
  if (!isValidPartialDate(date)) throw new Error('Invalid partial date')
  const fromYear = from.getUTCFullYear()
  const fixedYear = date.year
  const candidateYear = fixedYear ?? fromYear
  let candidate = new Date(Date.UTC(candidateYear, date.month - 1, date.day, 9))

  if (fixedYear === null && candidate.getTime() < from.getTime()) {
    candidate = new Date(Date.UTC(fromYear + 1, date.month - 1, date.day, 9))
  }

  return candidate
}

export function formatPartialDate(date: PartialDate, locale: string): string {
  const year = date.year ?? 2024
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    ...(date.year === null ? {} : { year: 'numeric' as const }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, date.month - 1, date.day)))
}

export function ageBetween(birthDate: PartialDate, laterDate: PartialDate): number | null {
  if (birthDate.year === null || laterDate.year === null) return null
  let age = laterDate.year - birthDate.year
  if (
    laterDate.month < birthDate.month ||
    (laterDate.month === birthDate.month && laterDate.day < birthDate.day)
  ) {
    age -= 1
  }
  return age >= 0 ? age : null
}
