import type { Person } from './model'

/** How names read on the People page: "Richard van der Meer" or "van der Meer, Richard". */
export type NameOrder = 'given-first' | 'family-first'

/** Name prefixes that are skipped when sorting on the family name ("van der Meer" under M). */
const familyPrefixes = new Set([
  'van',
  'de',
  'der',
  'den',
  'het',
  "'t",
  'ten',
  'ter',
  'te',
  'in',
  'op',
  'aan',
  'bij',
  'uit',
  'von',
  'zu',
  'vom',
  'du',
  'da',
  'di',
  'del',
  'la',
  'le',
])

/** The family name without its prefixes, as a phone book sorts it: "van der Meer" → "Meer". */
export function familySortKey(familyName: string): string {
  const words = familyName.trim().split(/\s+/)
  let index = 0
  while (index < words.length - 1 && familyPrefixes.has(words[index]!.toLocaleLowerCase())) {
    index += 1
  }
  return words.slice(index).join(' ')
}

export function listName(person: Person, order: NameOrder): string {
  if (order === 'given-first' || !person.familyName?.trim()) return person.displayName
  return person.givenName
    ? `${person.familyName.trim()}, ${person.givenName}`
    : person.familyName.trim()
}

/** People sorted for the chosen order: by first name, or by family name and then first name. */
export function sortByName(people: Person[], order: NameOrder, locale?: string): Person[] {
  const key = (person: Person) =>
    order === 'family-first' && person.familyName?.trim()
      ? `${familySortKey(person.familyName)} ${person.givenName ?? ''}`
      : person.displayName
  return [...people].sort((left, right) =>
    key(left).localeCompare(key(right), locale, { sensitivity: 'base' }),
  )
}
