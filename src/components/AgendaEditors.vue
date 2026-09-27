<script setup lang="ts">
import { useEditorsStore } from '@/stores/editors'

import AppointmentEditDialog from './AppointmentEditDialog.vue'
import LinkAppointmentDialog from './LinkAppointmentDialog.vue'
import MemoEditDialog from './MemoEditDialog.vue'

/** The shared edit dialogs, mounted once for the whole app. */
const editors = useEditorsStore()
</script>

<template>
  <MemoEditDialog :occurrence-id="editors.memoId" @close="editors.close()" />
  <AppointmentEditDialog :link-id="editors.appointmentId" @close="editors.close()" />
  <LinkAppointmentDialog :person-id="editors.linkForPersonId" @close="editors.close()" />
</template>
