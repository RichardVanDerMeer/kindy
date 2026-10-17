import type { Directive } from 'vue'

import { i18n } from '@/locales'
import { useToastStore } from '@/stores/toast'

type Handler = (event: MouseEvent) => unknown

interface AsyncElement extends HTMLElement {
  _asyncHandler?: Handler
  _asyncListener?: (event: MouseEvent) => void
}

/**
 * `v-async-click="handler"`: while the handler's promise runs, the button
 * shows a spinner (aria-busy) and ignores further taps. A failure shows a
 * message instead of disappearing silently.
 */
export const vAsyncClick: Directive<AsyncElement, Handler> = {
  mounted(element, binding) {
    element._asyncHandler = binding.value
    element._asyncListener = async (event) => {
      if (element.getAttribute('aria-busy') === 'true') return
      const result = element._asyncHandler?.(event)
      if (!(result instanceof Promise)) return
      element.setAttribute('aria-busy', 'true')
      try {
        await result
      } catch {
        useToastStore().show(i18n.global.t('common.failed'), 'error')
      } finally {
        element.removeAttribute('aria-busy')
      }
    }
    element.addEventListener('click', element._asyncListener)
  },
  updated(element, binding) {
    element._asyncHandler = binding.value
  },
  beforeUnmount(element) {
    if (element._asyncListener) element.removeEventListener('click', element._asyncListener)
  },
}
