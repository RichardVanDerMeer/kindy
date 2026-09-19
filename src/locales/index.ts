import { createI18n } from 'vue-i18n'

import en from './en'
import nl from './nl'

const savedLocale = localStorage.getItem('kindy.locale')
const systemLocale = navigator.language.toLocaleLowerCase().startsWith('nl') ? 'nl' : 'en'

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale === 'nl' || savedLocale === 'en' ? savedLocale : systemLocale,
  fallbackLocale: 'en',
  messages: { en, nl },
})
