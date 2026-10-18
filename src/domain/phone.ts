/** Country calling codes for the regions Kindy's users are most likely in. */
const callingCodes: Record<string, string> = {
  NL: '31',
  BE: '32',
  DE: '49',
  FR: '33',
  GB: '44',
  IE: '353',
  LU: '352',
  ES: '34',
  PT: '351',
  IT: '39',
  AT: '43',
  CH: '41',
  DK: '45',
  SE: '46',
  NO: '47',
  FI: '358',
  PL: '48',
  US: '1',
  CA: '1',
}
const knownCodes = [...new Set(Object.values(callingCodes))].sort((a, b) => b.length - a.length)
const FALLBACK_CODE = '31'

/** The calling code of an international number ("+31 6 …" gives "31"), when it is a known one. */
function codeOf(number: string): string | undefined {
  const trimmed = number.trim()
  const digits = trimmed.startsWith('+')
    ? trimmed.slice(1).replace(/\D/g, '')
    : trimmed.startsWith('00')
      ? trimmed.slice(2).replace(/\D/g, '')
      : undefined
  return digits ? knownCodes.find((code) => digits.startsWith(code)) : undefined
}

/**
 * The calling code numbers without one are dialled in: the user's own
 * number tells best, then the phone's region, then the Netherlands.
 */
export function homeCallingCode(ownNumbers: string[], locale?: string): string {
  for (const number of ownNumbers) {
    const code = codeOf(number)
    if (code) return code
  }
  try {
    const region = locale ? new Intl.Locale(locale).maximize().region : undefined
    if (region && callingCodes[region]) return callingCodes[region]
  } catch {
    // An unknown locale falls back below.
  }
  return FALLBACK_CODE
}

/**
 * The number as WhatsApp wants it: international, digits only. "06 1234 5678"
 * becomes "31612345678"; "+32 …" and "0032 …" keep their own country.
 */
export function internationalDigits(value: string, homeCode: string): string | undefined {
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, '')
  let international: string
  if (trimmed.startsWith('+')) international = digits
  else if (digits.startsWith('00')) international = digits.slice(2)
  else if (digits.startsWith('0')) international = homeCode + digits.slice(1)
  else international = digits
  return international.length >= 8 ? international : undefined
}

export function whatsappLink(value: string, homeCode: string): string | undefined {
  const digits = internationalDigits(value, homeCode)
  return digits ? `https://wa.me/${digits}` : undefined
}
