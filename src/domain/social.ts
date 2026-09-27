import { safeWebUrl } from './links'

export const socialPlatforms = [
  'linkedin',
  'instagram',
  'facebook',
  'x',
  'tiktok',
  'bluesky',
  'youtube',
  'github',
  'website',
] as const

export type SocialPlatform = (typeof socialPlatforms)[number]

const profileBase: Partial<Record<SocialPlatform, string>> = {
  linkedin: 'https://www.linkedin.com/in/',
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
  x: 'https://x.com/',
  tiktok: 'https://www.tiktok.com/@',
  bluesky: 'https://bsky.app/profile/',
  youtube: 'https://www.youtube.com/@',
  github: 'https://github.com/',
}

export function isSocialPlatform(value: string): value is SocialPlatform {
  return (socialPlatforms as readonly string[]).includes(value)
}

/**
 * Turns what the user typed into a link: a full URL is kept (web links only),
 * a handle such as "@robin" becomes that platform's profile URL.
 */
export function socialUrl(platform: string, value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^www\./i.test(trimmed)
  const base = isSocialPlatform(platform) ? profileBase[platform] : undefined
  if (looksLikeUrl || !base) return safeWebUrl(trimmed)
  const handle = trimmed.replace(/^@/, '')
  if (!/^[\w.-]{1,100}$/.test(handle)) return undefined
  return `${base}${handle}`
}

/** A short, readable version for the details list: the handle or the domain. */
export function socialDisplay(platform: string, value: string): string {
  const trimmed = value.trim()
  const url = socialUrl(platform, trimmed)
  const known = isSocialPlatform(platform) && platform !== 'website'
  if (!url || !/^[a-z]+:\/\//i.test(trimmed)) {
    return known ? trimmed.replace(/^@?/, '@') : trimmed
  }
  const { hostname, pathname } = new URL(url)
  const host = hostname.replace(/^www\./, '')
  const path = pathname.replace(/\/$/, '')
  if (!path) return host
  // A profile on a known platform is its handle; any other link keeps its site.
  return known ? path.slice(1) : platform === 'website' ? host : `${host}${path}`
}
