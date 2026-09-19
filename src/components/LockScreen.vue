<script setup lang="ts">
import { Fingerprint, LockKeyhole } from '@lucide/vue'

defineProps<{ busy?: boolean }>()
defineEmits<{ unlock: [] }>()
</script>

<template>
  <section class="lock-screen">
    <div class="lock-screen__mark"><LockKeyhole :size="34" /></div>
    <h1>Kindy</h1>
    <p>{{ $t('security.lockedHint') }}</p>
    <button
      class="button button--primary lock-screen__button"
      :disabled="busy"
      @click="$emit('unlock')"
    >
      <Fingerprint :size="22" />
      {{ busy ? $t('security.authenticating') : $t('security.unlock') }}
    </button>
    <small>{{ $t('security.deviceCredential') }}</small>
  </section>
</template>
