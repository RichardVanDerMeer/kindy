/**
 * Labels for phone numbers and email addresses. Kindy stores Google's own type
 * keys ("mobile", "work", ...) so they round-trip to Google unchanged; custom
 * labels from Google ("Holiday home") are kept as typed.
 */
export const phoneLabels = ['mobile', 'home', 'work', 'main', 'other'] as const
export const emailLabels = ['home', 'work', 'other'] as const

const knownLabels = new Set<string>([
  ...phoneLabels,
  ...emailLabels,
  'workMobile',
  'homeFax',
  'workFax',
  'pager',
  'googleVoice',
])

export function isKnownLabel(label: string): boolean {
  return knownLabels.has(label)
}

/** Older Kindy data used Dutch words; map them onto Google's keys. */
const legacyLabels: Record<string, string> = {
  mobiel: 'mobile',
  privé: 'home',
  prive: 'home',
  thuis: 'home',
  werk: 'work',
  phone: 'mobile',
  email: 'home',
}

export function normalizeContactLabel(label: string | undefined): string {
  const trimmed = label?.trim() ?? ''
  if (!trimmed) return 'other'
  return legacyLabels[trimmed.toLocaleLowerCase()] ?? trimmed
}
