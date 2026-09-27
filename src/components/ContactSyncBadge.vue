<script setup lang="ts">
import { computed, ref } from 'vue'
import { CloudAlert, CloudCheck, CloudUpload, RefreshCw } from '@lucide/vue'

import { useKindyStore } from '@/stores/kindy'

import SaveToGoogleDialog from './SaveToGoogleDialog.vue'

const props = defineProps<{ personId: string }>()
const store = useKindyStore()

const status = computed(() => store.contactSyncStatus(props.personId))
const explaining = ref(false)
const name = computed(() => {
  const person = store.personById(props.personId)
  return person?.givenName ?? person?.displayName ?? ''
})

async function confirm(): Promise<void> {
  explaining.value = false
  await store.saveToGoogle(props.personId)
}
</script>

<template>
  <span v-if="status === 'synced'" class="sync-badge sync-badge--synced">
    <CloudCheck :size="15" /> {{ $t('contactSync.synced') }}
  </span>
  <span v-else-if="status === 'pending'" class="sync-badge sync-badge--pending" role="status">
    <CloudUpload :size="15" /> {{ $t('contactSync.pending') }}
  </span>
  <button
    v-else-if="status === 'failed'"
    class="sync-badge sync-badge--failed"
    @click="store.retryContactSync(personId)"
  >
    <CloudAlert :size="15" /> {{ $t('contactSync.failed') }} · <RefreshCw :size="13" />
    {{ $t('contactSync.retry') }}
  </button>
  <button
    v-else-if="store.googleLinked"
    class="sync-badge sync-badge--local"
    @click="explaining = true"
  >
    <CloudUpload :size="15" /> {{ $t('contactSync.saveToGoogle') }}
  </button>
  <span v-else class="sync-badge">{{ $t('contactSync.local') }}</span>
  <SaveToGoogleDialog
    :open="explaining"
    :name="name"
    @close="explaining = false"
    @confirm="confirm"
  />
</template>
