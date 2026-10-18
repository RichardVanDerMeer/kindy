<script setup lang="ts">
import { ref } from 'vue'
import { Check, ImagePlus, ImageOff } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { readImageFile } from '@/composables/imageFile'

import { circlePresets, presetBackground } from './circleIcons'

/** Picks the header picture of a profile: one of Kindy's illustrations, or an own photo. */
const props = defineProps<{ open: boolean; current?: string }>()
const emit = defineEmits<{ close: []; choose: [coverRef: string | undefined] }>()
const { t } = useI18n()
const fileInput = ref<HTMLInputElement>()
const reading = ref(false)

async function pickFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (fileInput.value) fileInput.value.value = ''
  if (!file) return
  reading.value = true
  try {
    // Wide enough for the header, small enough to store and back up.
    emit('choose', await readImageFile(file, { maxSize: 1200 }))
  } finally {
    reading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <section class="dialog dialog--scroll" role="dialog" aria-modal="true">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ t('cover.title') }}</h2>
        <p class="muted">{{ t('cover.hint') }}</p>

        <div class="cover-actions">
          <button
            type="button"
            class="button button--ghost"
            :aria-busy="reading || undefined"
            @click="fileInput?.click()"
          >
            <ImagePlus :size="17" /> {{ t('cover.ownPhoto') }}
          </button>
          <button
            v-if="props.current"
            type="button"
            class="button button--ghost"
            @click="emit('choose', undefined)"
          >
            <ImageOff :size="17" /> {{ t('cover.none') }}
          </button>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="pickFile" />
        </div>

        <div class="preset-grid">
          <button
            v-for="preset in circlePresets"
            :key="preset.id"
            type="button"
            class="preset-choice"
            :class="{ 'preset-choice--active': props.current === presetBackground(preset.id) }"
            :aria-pressed="props.current === presetBackground(preset.id)"
            @click="emit('choose', presetBackground(preset.id))"
          >
            <img :src="presetBackground(preset.id)" alt="" loading="lazy" />
            <span>{{ t(`circles.presets.${preset.id}`) }}</span>
            <Check
              v-if="props.current === presetBackground(preset.id)"
              class="preset-choice__check"
              :size="16"
            />
          </button>
        </div>

        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ t('common.close') }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
