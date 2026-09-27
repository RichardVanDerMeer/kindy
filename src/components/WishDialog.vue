<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Trash2 } from '@lucide/vue'

import type { WishItem } from '@/domain/model'

const props = defineProps<{ open: boolean; wish?: WishItem }>()
const emit = defineEmits<{
  close: []
  save: [input: Pick<WishItem, 'title' | 'url' | 'note' | 'status'>]
  remove: []
}>()

const title = ref('')
const url = ref('')
const note = ref('')
const status = ref<WishItem['status']>('idea')
const titleInput = ref<HTMLInputElement>()
const statuses: WishItem['status'][] = ['idea', 'bought', 'given']

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    title.value = props.wish?.title ?? ''
    url.value = props.wish?.url ?? ''
    note.value = props.wish?.note ?? ''
    status.value = props.wish?.status ?? 'idea'
    await nextTick()
    titleInput.value?.focus()
  },
)

function submit(): void {
  if (!title.value.trim()) return
  emit('save', { title: title.value, url: url.value, note: note.value, status: status.value })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <form class="dialog" role="dialog" aria-modal="true" @submit.prevent="submit">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ wish ? $t('wishes.edit') : $t('wishes.add') }}</h2>
        <label class="field">
          <span>{{ $t('wishes.field') }}</span>
          <input ref="titleInput" v-model="title" required autocomplete="off" />
        </label>
        <label class="field">
          <span>{{ $t('wishes.url') }}</span>
          <input v-model="url" type="url" inputmode="url" autocomplete="off" />
        </label>
        <label class="field">
          <span>{{ $t('wishes.note') }}</span>
          <input v-model="note" autocomplete="off" />
        </label>
        <div class="segmented segmented--three" role="radiogroup">
          <button
            v-for="option in statuses"
            :key="option"
            type="button"
            role="radio"
            :aria-checked="status === option"
            :class="{ active: status === option }"
            @click="status = option"
          >
            {{ $t(`wishes.status.${option}`) }}
          </button>
        </div>
        <div class="dialog__actions">
          <button
            v-if="wish"
            type="button"
            class="button button--ghost button--danger"
            @click="emit('remove')"
          >
            <Trash2 :size="17" /> {{ $t('wishes.delete') }}
          </button>
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ $t('people.cancel') }}
          </button>
          <button type="submit" class="button button--primary" :disabled="!title.trim()">
            {{ $t('wishes.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
