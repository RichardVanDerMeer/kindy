import type { Person } from './model'

/**
 * Picks the avatars for a circle card: favorites first, then alphabetical.
 * When there are more members than slots, the last slot becomes a "+N"
 * counter for everyone who is not shown.
 */
export function circleAvatarStack(
  members: Person[],
  maxSlots = 6,
): { shown: Person[]; overflow: number } {
  const ordered = [...members].sort(
    (left, right) =>
      Number(right.isFavorite) - Number(left.isFavorite) ||
      left.displayName.localeCompare(right.displayName),
  )
  if (ordered.length <= maxSlots) return { shown: ordered, overflow: 0 }
  const shown = ordered.slice(0, maxSlots - 1)
  return { shown, overflow: ordered.length - shown.length }
}
