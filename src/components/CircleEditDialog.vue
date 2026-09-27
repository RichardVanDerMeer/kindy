<script setup lang="ts">
import { ref, watch } from 'vue'
import { Check, ImagePlus, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { readImageFile } from '@/composables/imageFile'
import type { Circle } from '@/domain/model'

import {
  circleColors,
  circleIcon,
  circleIcons,
  circlePresets,
  presetBackground,
  type CirclePreset,
} from './circleIcons'

const props = defineProps<{ open: boolean; circle?: Circle }>()
const emit = defineEmits<{ close: []; save: [circle: Circle] }>()

const { t } = useI18n()
const draft = ref<Circle>(blank())
const presetGroups = ['general', 'sport'] as const
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

async function pickImage(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  draft.value.backgroundImageRef = await readImageFile(file, { maxSize: 900 })
  if (fileInput.value) fileInput.value.value = ''
}

/** A preset brings a matching icon and colour, and a name for a new circle. */
function choosePreset(preset: CirclePreset): void {
  draft.value.backgroundImageRef = presetBackground(preset.id)
  draft.value.iconKey = preset.icon
  draft.value.colorToken = preset.color
  if (!draft.value.name.trim()) draft.value.name = t(`circles.presets.${preset.id}`)
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
            <component :is="circleIcon(draft.iconKey)" :size="22" />
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
          <legend>{{ $t('circles.backgroundPresets') }}</legend>
          <div v-for="group in presetGroups" :key="group" class="preset-group">
            <span class="generation-label">{{ $t(`circles.presetGroups.${group}`) }}</span>
            <div class="preset-grid">
              <button
                v-for="preset in circlePresets.filter((candidate) => candidate.group === group)"
                :key="preset.id"
                type="button"
                class="preset-choice"
                :class="{
                  'preset-choice--active': draft.backgroundImageRef === presetBackground(preset.id),
                }"
                :aria-pressed="draft.backgroundImageRef === presetBackground(preset.id)"
                @click="choosePreset(preset)"
              >
                <img :src="presetBackground(preset.id)" alt="" loading="lazy" />
                <span>{{ $t(`circles.presets.${preset.id}`) }}</span>
                <Check
                  v-if="draft.backgroundImageRef === presetBackground(preset.id)"
                  class="preset-choice__check"
                  :size="16"
                />
              </button>
            </div>
          </div>
          <div class="image-actions">
            <button type="button" class="button button--ghost" @click="fileInput?.click()">
              <ImagePlus :size="18" /> {{ $t('circles.ownImage') }}
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
