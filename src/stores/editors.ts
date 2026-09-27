import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * Opens the shared edit dialogs for memos and appointments, and the dialog to
 * link an appointment by hand, from anywhere in the app.
 */
export const useEditorsStore = defineStore('editors', () => {
  const memoId = ref<string>()
  const appointmentId = ref<string>()
  const linkForPersonId = ref<string>()

  return {
    memoId,
    appointmentId,
    linkForPersonId,
    editMemo: (occurrenceId: string) => (memoId.value = occurrenceId),
    editAppointment: (linkId: string) => (appointmentId.value = linkId),
    linkAppointment: (personId: string) => (linkForPersonId.value = personId),
    close: () => {
      memoId.value = undefined
      appointmentId.value = undefined
      linkForPersonId.value = undefined
    },
  }
})
