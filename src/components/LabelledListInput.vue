<script setup lang="ts">
import { Plus, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { isKnownLabel } from '@/domain/contactLabels'
import type { LabelledValue } from '@/stores/kindy'

/** Values with a label each, e.g. phone numbers: "Mobile · +31 6 …". */
const props = defineProps<{
  labels: readonly string[]
  inputType?: string
  addText: string
  placeholder?: string
}>()
const entries = defineModel<LabelledValue[]>({ required: true })
const { t } = useI18n()

/** Known labels are translated; a custom label from Google is offered as typed. */
function options(current: string): string[] {
  return props.labels.includes(current) ? [...props.labels] : [current, ...props.labels]
}

function labelText(label: string): string {
  return isKnownLabel(label) ? t(`contactLabels.${label}`) : label
}

function add(): void {
  entries.value = [...entries.value, { value: '', label: props.labels[0] ?? 'other' }]
}

function remove(index: number): void {
  entries.value = entries.value.filter((_, position) => position !== index)
}
</script>

<template>
  <div v-for="(entry, index) in entries" :key="index" class="list-input list-input--labelled">
    <select v-model="entry.label" :aria-label="$t('edit.label')">
      <option v-for="label in options(entry.label)" :key="label" :value="label">
        {{ labelText(label) }}
      </option>
    </select>
    <input
      v-model="entry.value"
      :type="inputType ?? 'text'"
      :placeholder="placeholder"
      autocomplete="off"
    />
    <button
      type="button"
      class="icon-button"
      :aria-label="$t('edit.remove')"
      @click="remove(index)"
    >
      <X :size="18" />
    </button>
  </div>
  <button type="button" class="inline-action" @click="add">
    <Plus :size="16" /> {{ addText }}
  </button>
</template>
