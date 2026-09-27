/**
 * Returns the URL only when it is a plain web link. Anything else (such as a
 * javascript: or intent: URL from typed input or a restored backup) could run
 * code or open other apps when tapped, so it is dropped.
 */
export function safeWebUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}
