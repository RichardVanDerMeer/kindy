import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { describeAgendaItem, primaryPerson } from '@/composables/agendaText'
import type { AgendaFilter } from '@/domain/agenda'
import type { Person } from '@/domain/model'
import {
  buildComingUpSnapshot,
  defaultComingUpPreferences,
  type ComingUpPreferences,
} from '@/domain/widget'
import { getWidgetGateway } from '@/infrastructure/widgets/widgetGateway'
import { i18n } from '@/locales'

import { useKindyStore } from './kindy'
import { useSecurityStore } from './security'

const PREFERENCES_KEY = 'kindy.widget.comingUp'

function readPreferences(): ComingUpPreferences {
  try {
    const stored = JSON.parse(
      localStorage.getItem(PREFERENCES_KEY) ?? 'null',
    ) as Partial<ComingUpPreferences> | null
    return {
      filters: Array.isArray(stored?.filters) ? stored.filters : [],
      hideNames: stored?.hideNames === true,
    }
  } catch {
    return { ...defaultComingUpPreferences }
  }
}

/**
 * Keeps the "Coming up" widget in step with Kindy. The snapshot is rebuilt
 * after every change and only ever contains what the widget shows. With the
 * app lock on, names are always hidden: the widget sits outside the lock.
 */
export const useWidgetStore = defineStore('widget', () => {
  const kindy = useKindyStore()
  const security = useSecurityStore()
  const preferences = ref(readPreferences())
  const namesForcedHidden = computed(() => security.enabled)
  const hideNames = computed(() => namesForcedHidden.value || preferences.value.hideNames)

  const snapshot = computed(() => {
    if (!kindy.data) return null
    const { t } = i18n.global
    const locale = i18n.global.locale.value
    return buildComingUpSnapshot(kindy.agenda, {
      preferences: preferences.value,
      hideNames: hideNames.value,
      describe: (item) => {
        const people = item.personIds
          .map((id) => kindy.personById(id))
          .filter((person): person is Person => Boolean(person))
        return {
          ...describeAgendaItem(item, people, t, locale),
          personId: primaryPerson(people)?.id,
        }
      },
      genericTitle: (filter: AgendaFilter) => t(`widget.generic.${filter}`),
      heading: t('upcoming.title'),
      empty: t('widget.empty'),
      labels: { today: t('upcoming.today'), tomorrow: t('upcoming.tomorrow') },
      locale,
      now: Date.now(),
    })
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    snapshot,
    (next) => {
      if (!next) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        getWidgetGateway()
          .writeComingUp(next)
          .catch(() => {
            // The widget keeps its previous content; the next change retries.
          })
      }, 1_000)
    },
    { immediate: true },
  )

  function savePreferences(next: ComingUpPreferences): void {
    preferences.value = next
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next))
    } catch {
      // Applies for this session.
    }
  }

  return { preferences, namesForcedHidden, hideNames, snapshot, savePreferences }
})
