<script setup lang="ts">
import { computed } from 'vue'
import { CloudAlert, RefreshCw } from '@lucide/vue'

import { useKindyStore } from '@/stores/kindy'

const props = defineProps<{ personId: string }>()
const store = useKindyStore()

/** Saving to Google is the normal case; only a failure needs the user. */
const failed = computed(() => store.contactSyncStatus(props.personId) === 'failed')
</script>

<template>
  <button
    v-if="failed"
    class="sync-badge sync-badge--failed"
    @click="store.retryContactSync(personId)"
  >
    <CloudAlert :size="15" /> {{ $t('contactSync.failed') }} · <RefreshCw :size="13" />
    {{ $t('contactSync.retry') }}
  </button>
</template>
