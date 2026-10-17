<script setup lang="ts">
import { CircleAlert, CircleCheck } from '@lucide/vue'

import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <TransitionGroup name="toast">
      <button
        v-for="item in toast.toasts"
        :key="item.id"
        type="button"
        class="toast"
        :class="`toast--${item.tone}`"
        :role="item.tone === 'error' ? 'alert' : 'status'"
        @click="toast.dismiss(item.id)"
      >
        <CircleAlert v-if="item.tone === 'error'" :size="18" aria-hidden="true" />
        <CircleCheck v-else :size="18" aria-hidden="true" />
        <span>{{ item.message }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>
