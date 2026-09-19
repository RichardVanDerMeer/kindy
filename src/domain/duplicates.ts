import type { Person } from './model'

export interface DuplicateScore {
  score: number
  reasons: string[]
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function scoreDuplicate(left: Person, right: Person): DuplicateScore {
  const reasons: string[] = []
  let score = 0
  const leftPoints = new Map(left.contactPoints.map((point) => [point.normalizedValue, point.kind]))

  for (const point of right.contactPoints) {
    const matchedKind = leftPoints.get(point.normalizedValue)
    if (matchedKind === 'phone' && point.kind === 'phone') {
      score = Math.max(score, 100)
      reasons.push('same-phone')
    } else if (matchedKind === 'email' && point.kind === 'email') {
      score = Math.max(score, 95)
      reasons.push('same-email')
    }
  }

  if (normalizeText(left.displayName) === normalizeText(right.displayName)) {
    score += 35
    reasons.push('same-name')
  }

  if (
    left.nickname &&
    right.nickname &&
    normalizeText(left.nickname) === normalizeText(right.nickname)
  ) {
    score += 15
    reasons.push('same-nickname')
  }

  return { score: Math.min(100, score), reasons: [...new Set(reasons)] }
}
