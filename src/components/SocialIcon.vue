<script setup lang="ts">
import { Globe, Link2 } from '@lucide/vue'

/**
 * Simple, single-colour marks for social platforms (the icon set has no brand
 * logos). They follow the text colour like the other icons.
 */
withDefaults(defineProps<{ platform: string; size?: number }>(), { size: 20 })
</script>

<template>
  <svg
    v-if="
      ['linkedin', 'instagram', 'facebook', 'x', 'tiktok', 'youtube', 'github', 'bluesky'].includes(
        platform,
      )
    "
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="platform === 'linkedin'">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 10.5V16M8 7.8v.2M11.5 16v-5.5M11.5 13c0-1.5 1-2.6 2.4-2.6s2.1 1 2.1 2.6V16" />
    </template>
    <template v-else-if="platform === 'instagram'">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.2 6.8v.1" />
    </template>
    <template v-else-if="platform === 'facebook'">
      <circle cx="12" cy="12" r="9" />
      <path d="M13.5 21v-7.5h2.5M13.5 13.5V11c0-1.4.8-2.2 2.2-2.2h1M11 13.5h2.5" />
    </template>
    <template v-else-if="platform === 'x'">
      <path d="M4 4l16 16M20 4L4 20" />
    </template>
    <template v-else-if="platform === 'tiktok'">
      <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.4 2.4 2 4 4.5 4.2" />
    </template>
    <template v-else-if="platform === 'youtube'">
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.5 9.5l4 2.5-4 2.5z" />
    </template>
    <template v-else-if="platform === 'github'">
      <path
        d="M9 19c-4 1.3-4-2-5.5-2.5M14.5 21v-3.2c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.1 3.1 5.1 3.4 5.1 3.4a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 3.7 9.8c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"
      />
    </template>
    <template v-else-if="platform === 'bluesky'">
      <path
        d="M12 11c-1.5-3-5.6-7.4-7.5-6C2.6 6.3 4 11 5.5 12.2 7 13.3 9 13 9 13s-3.5 1.5-2 4c1.6 2.6 4-1 5-3 1 2 3.4 5.6 5 3 1.5-2.5-2-4-2-4s2 .3 3.5-.8C20 11 21.4 6.3 19.5 5c-1.9-1.4-6 3-7.5 6z"
      />
    </template>
  </svg>
  <Globe v-else-if="platform === 'website'" :size="size" aria-hidden="true" />
  <Link2 v-else :size="size" aria-hidden="true" />
</template>
