import { computed, ref } from 'vue'

/**
 * Hides an image that fails to load (a moved file, or a remote photo while
 * offline) so the surrounding colour or initials show instead of a broken icon.
 */
export function useImageFallback(source: () => string | undefined) {
  const failed = ref<string>()
  const src = computed(() => {
    const value = source()
    return value && value !== failed.value ? value : undefined
  })
  function onError(): void {
    failed.value = source()
  }
  return { src, onError }
}
