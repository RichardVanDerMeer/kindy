import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { AgendaAudience } from '@/domain/agenda'
import type { NameOrder } from '@/domain/names'

const NAME_ORDER_KEY = 'kindy.nameOrder'
const AUDIENCE_KEY = 'kindy.agenda.audience'

/** Display preferences that live on this device. */
export const usePreferencesStore = defineStore('preferences', () => {
  const nameOrder = ref<NameOrder>(readNameOrder())

  function setNameOrder(order: NameOrder): void {
    nameOrder.value = order
    try {
      localStorage.setItem(NAME_ORDER_KEY, order)
    } catch {
      // The choice still applies for this session.
    }
  }

  /** Whose birthdays and dates Upcoming shows; "close" keeps hundreds of contacts calm. */
  const agendaAudience = ref<AgendaAudience>(readAudience())

  function setAgendaAudience(audience: AgendaAudience): void {
    agendaAudience.value = audience
    try {
      localStorage.setItem(AUDIENCE_KEY, audience)
    } catch {
      // The choice still applies for this session.
    }
  }

  return { nameOrder, setNameOrder, agendaAudience, setAgendaAudience }
})

function readAudience(): AgendaAudience {
  try {
    return localStorage.getItem(AUDIENCE_KEY) === 'everyone' ? 'everyone' : 'close'
  } catch {
    return 'close'
  }
}

function readNameOrder(): NameOrder {
  try {
    return localStorage.getItem(NAME_ORDER_KEY) === 'family-first' ? 'family-first' : 'given-first'
  } catch {
    return 'given-first'
  }
}
