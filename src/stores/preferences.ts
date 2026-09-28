import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { NameOrder } from '@/domain/names'

const NAME_ORDER_KEY = 'kindy.nameOrder'

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

  return { nameOrder, setNameOrder }
})

function readNameOrder(): NameOrder {
  try {
    return localStorage.getItem(NAME_ORDER_KEY) === 'family-first' ? 'family-first' : 'given-first'
  } catch {
    return 'given-first'
  }
}
