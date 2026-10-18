import { describe, expect, it } from 'vitest'

import { homeCallingCode, internationalDigits, whatsappLink } from '@/domain/phone'

describe('phone numbers for WhatsApp', () => {
  it('adds the home country to a national number', () => {
    expect(internationalDigits('06 1234 5678', '31')).toBe('31612345678')
    expect(internationalDigits('(030) 123 4567', '31')).toBe('31301234567')
  })

  it('keeps an international number as it is', () => {
    expect(internationalDigits('+31 6 1234 5678', '31')).toBe('31612345678')
    expect(internationalDigits('+32 470 12 34 56', '31')).toBe('32470123456')
    expect(internationalDigits('0032 470 12 34 56', '31')).toBe('32470123456')
  })

  it('makes no link for something that is not a number', () => {
    expect(whatsappLink('112', '31')).toBeUndefined()
    expect(whatsappLink('06 1234 5678', '31')).toBe('https://wa.me/31612345678')
  })

  it('takes the home country from the user’s own number, then the phone’s region', () => {
    expect(homeCallingCode(['+32 470 12 34 56'], 'nl-NL')).toBe('32')
    expect(homeCallingCode(['06 1234 5678'], 'de-DE')).toBe('49')
    expect(homeCallingCode([], 'nl')).toBe('31')
    expect(homeCallingCode([], undefined)).toBe('31')
  })
})
