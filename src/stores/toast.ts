import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
}

/** Short messages at the bottom of the screen: confirmations and failures. */
export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])
  let nextId = 1

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function show(message: string, tone: Toast['tone'] = 'info'): void {
    const id = nextId++
    // One message at a time keeps the screen calm; the newest wins.
    toasts.value = [{ id, message, tone }]
    setTimeout(() => dismiss(id), tone === 'error' ? 5_000 : 2_800)
  }

  return { toasts, show, dismiss }
})
