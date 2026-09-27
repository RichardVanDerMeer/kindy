const DEEP_LINK = /^kindy:\/\/(?:(upcoming)|people\/([A-Za-z0-9_-]{1,64}))\/?$/

/**
 * Maps a kindy:// link (used by the home-screen widget) to an app route. Only
 * these exact shapes are accepted, so another app cannot steer Kindy to an
 * arbitrary place.
 */
export function routeForDeepLink(url: string): string | null {
  const match = DEEP_LINK.exec(url.trim())
  if (!match) return null
  return match[1] ? '/upcoming' : `/people/${match[2]}`
}
