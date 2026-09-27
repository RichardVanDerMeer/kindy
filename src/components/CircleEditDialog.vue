<script setup lang="ts">
import { ref, watch } from 'vue'
import { ImagePlus, Trash2 } from '@lucide/vue'

import type { Circle } from '@/domain/model'

import { circleColors, circleIcons } from './circleIcons'

const props = defineProps<{ open: boolean; circle?: Circle }>()
const emit = defineEmits<{ close: []; save: [circle: Circle] }>()

const draft = ref<Circle>(blank())
const fileInput = ref<HTMLInputElement>()

function blank(): Circle {
  return {
    id: crypto.randomUUID(),
    name: '',
    colorToken: 'primary',
    iconKey: 'users',
    isFavorite: false,
    isArchived: false,
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) draft.value = props.circle ? { ...props.circle } : blank()
  },
)

/** Scales the picked image down so it stays small enough for local storage. */
async function readImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 900 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}

async function pickImage(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  draft.value.backgroundImageRef = await readImage(file)
  if (fileInput.value) fileInput.value.value = ''
}

function submit(): void {
  if (!draft.value.name.trim()) return
  emit('save', {
    ...draft.value,
    name: draft.value.name.trim(),
    description: draft.value.description?.trim() || undefined,
  })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <form class="dialog dialog--scroll" role="dialog" aria-modal="true" @submit.prevent="submit">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ circle ? $t('circles.edit') : $t('circles.add') }}</h2>

        <div
          class="circle-preview"
          :class="[
            `surface--${draft.colorToken}`,
            { 'circle-card--image': draft.backgroundImageRef },
          ]"
        >
          <img v-if="draft.backgroundImageRef" :src="draft.backgroundImageRef" alt="" />
          <span class="circle-card__icon">
            <component :is="circleIcons[draft.iconKey]" :size="22" />
          </span>
          <strong>{{ draft.name || $t('circles.name') }}</strong>
        </div>

        <label class="field">
          <span>{{ $t('circles.name') }}</span>
          <input v-model="draft.name" required />
        </label>
        <label class="field">
          <span>{{ $t('circles.description') }}</span>
          <input v-model="draft.description" />
        </label>

        <fieldset class="field picker-field">
          <legend>{{ $t('circles.icon') }}</legend>
          <div class="icon-picker">
            <button
              v-for="(icon, key) in circleIcons"
              :key="key"
              type="button"
              class="icon-choice"
              :class="{ 'icon-choice--active': draft.iconKey === key }"
              :aria-label="key"
              :aria-pressed="draft.iconKey === key"
              @click="draft.iconKey = key"
            >
              <component :is="icon" :size="20" />
            </button>
          </div>
        </fieldset>

        <fieldset class="field picker-field">
          <legend>{{ $t('circles.color') }}</legend>
          <div class="color-picker">
            <button
              v-for="color in circleColors"
              :key="color"
              type="button"
              class="color-choice"
              :class="[`surface--${color}`, { 'color-choice--active': draft.colorToken === color }]"
              :aria-label="color"
              :aria-pressed="draft.colorToken === color"
              @click="draft.colorToken = color"
            />
          </div>
        </fieldset>

        <fieldset class="field picker-field">
          <legend>{{ $t('circles.background') }}</legend>
          <div class="image-actions">
            <button type="button" class="button button--ghost" @click="fileInput?.click()">
              <ImagePlus :size="18" /> {{ $t('circles.chooseImage') }}
            </button>
            <button
              v-if="draft.backgroundImageRef"
              type="button"
              class="button button--ghost"
              @click="draft.backgroundImageRef = undefined"
            >
              <Trash2 :size="18" /> {{ $t('circles.removeImage') }}
            </button>
          </div>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="pickImage" />
        </fieldset>

        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="submit" class="button button--primary" :disabled="!draft.name.trim()">
            {{ $t('circles.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
