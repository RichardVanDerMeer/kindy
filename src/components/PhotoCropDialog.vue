<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ZoomIn, ZoomOut } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

/**
 * Lets the user move and zoom a picked photo inside a round frame, then
 * returns a square crop. Drag to move; pinch, the slider or the wheel to zoom.
 */
const props = defineProps<{ file: File | null }>()
const emit = defineEmits<{ close: []; done: [photo: string] }>()
const { t } = useI18n()

/** Frame size on screen and size of the stored photo, in pixels. */
const FRAME = 280
const OUTPUT = 512
const MAX_ZOOM = 4

const source = ref<string>()
const natural = ref({ width: 1, height: 1 })
const zoom = ref(1)
const offset = ref({ x: 0, y: 0 })
const saving = ref(false)

/** The image covers the frame at zoom 1. */
const baseScale = computed(() => FRAME / Math.min(natural.value.width, natural.value.height))
const scale = computed(() => baseScale.value * zoom.value)

function clamp(next: { x: number; y: number }): { x: number; y: number } {
  const width = natural.value.width * scale.value
  const height = natural.value.height * scale.value
  return {
    x: Math.min(0, Math.max(FRAME - width, next.x)),
    y: Math.min(0, Math.max(FRAME - height, next.y)),
  }
}

/** Zooms around a point in the frame (its centre by default), keeping that point in place. */
function setZoom(next: number, focus = { x: FRAME / 2, y: FRAME / 2 }): void {
  const target = Math.min(MAX_ZOOM, Math.max(1, next))
  const ratio = target / zoom.value
  zoom.value = target
  offset.value = clamp({
    x: focus.x - (focus.x - offset.value.x) * ratio,
    y: focus.y - (focus.y - offset.value.y) * ratio,
  })
}

watch(
  () => props.file,
  (file) => {
    if (source.value) URL.revokeObjectURL(source.value)
    source.value = file ? URL.createObjectURL(file) : undefined
    zoom.value = 1
    saving.value = false
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (source.value) URL.revokeObjectURL(source.value)
})

function loaded(event: Event): void {
  const image = event.target as HTMLImageElement
  natural.value = { width: image.naturalWidth, height: image.naturalHeight }
  // Start centred.
  offset.value = clamp({
    x: (FRAME - image.naturalWidth * scale.value) / 2,
    y: (FRAME - image.naturalHeight * scale.value) / 2,
  })
}

const pointers = new Map<number, { x: number; y: number }>()
let pinchDistance = 0

function distance(): number {
  const [first, second] = [...pointers.values()]
  return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0
}

function pointerDown(event: PointerEvent): void {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  pinchDistance = distance()
}

function pointerMove(event: PointerEvent): void {
  const previous = pointers.get(event.pointerId)
  if (!previous) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) {
    const next = distance()
    if (pinchDistance) setZoom((zoom.value * next) / pinchDistance)
    pinchDistance = next
    return
  }
  offset.value = clamp({
    x: offset.value.x + event.clientX - previous.x,
    y: offset.value.y + event.clientY - previous.y,
  })
}

function pointerUp(event: PointerEvent): void {
  pointers.delete(event.pointerId)
  pinchDistance = distance()
}

function wheel(event: WheelEvent): void {
  const frame = (event.currentTarget as HTMLElement).getBoundingClientRect()
  setZoom(zoom.value * (event.deltaY < 0 ? 1.1 : 0.9), {
    x: event.clientX - frame.left,
    y: event.clientY - frame.top,
  })
}

async function confirm(): Promise<void> {
  if (!props.file) return
  saving.value = true
  const bitmap = await createImageBitmap(props.file)
  const size = FRAME / scale.value
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(OUTPUT, Math.round(size))
  canvas.height = canvas.width
  canvas
    .getContext('2d')
    ?.drawImage(
      bitmap,
      -offset.value.x / scale.value,
      -offset.value.y / scale.value,
      size,
      size,
      0,
      0,
      canvas.width,
      canvas.height,
    )
  bitmap.close()
  emit('done', canvas.toDataURL('image/jpeg', 0.85))
}
</script>

<template>
  <Teleport to="body">
    <div v-if="file" class="dialog-backdrop" @click.self="emit('close')">
      <section class="dialog photo-crop" role="dialog" aria-modal="true">
        <div class="dialog__handle" aria-hidden="true"></div>
        <h2>{{ t('crop.title') }}</h2>
        <p class="muted">{{ t('crop.hint') }}</p>

        <div
          class="photo-crop__frame"
          :style="{ width: `${FRAME}px`, height: `${FRAME}px` }"
          @pointerdown="pointerDown"
          @pointermove="pointerMove"
          @pointerup="pointerUp"
          @pointercancel="pointerUp"
          @wheel.prevent="wheel"
        >
          <img
            v-if="source"
            :src="source"
            alt=""
            draggable="false"
            :style="{
              width: `${natural.width * scale}px`,
              height: `${natural.height * scale}px`,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }"
            @load="loaded"
          />
          <span class="photo-crop__mask" aria-hidden="true"></span>
        </div>

        <label class="photo-crop__zoom">
          <ZoomOut :size="18" aria-hidden="true" />
          <span class="sr-only">{{ t('crop.zoom') }}</span>
          <input
            type="range"
            min="1"
            :max="MAX_ZOOM"
            step="0.01"
            :value="zoom"
            @input="setZoom(Number(($event.target as HTMLInputElement).value))"
          />
          <ZoomIn :size="18" aria-hidden="true" />
        </label>

        <div class="dialog__actions">
          <button type="button" class="button button--ghost" @click="emit('close')">
            {{ t('people.cancel') }}
          </button>
          <button
            type="button"
            class="button button--primary"
            :disabled="!source || saving"
            :aria-busy="saving || undefined"
            @click="confirm"
          >
            {{ t('crop.use') }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
