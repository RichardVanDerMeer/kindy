import { useI18n } from 'vue-i18n'

export const supportedLocales = [
  { code: 'nl', label: 'Nederlands' },
  { code: 'en', label: 'English' },
] as const

export type SupportedLocale = (typeof supportedLocales)[number]['code']

export function useLocaleSetting() {
  const { locale } = useI18n()

  function setLocale(next: SupportedLocale): void {
    locale.value = next
    document.documentElement.lang = next
    try {
      localStorage.setItem('kindy.locale', next)
    } catch {
      // The choice still applies for this session.
    }
  }

  return { locale, setLocale }
}
