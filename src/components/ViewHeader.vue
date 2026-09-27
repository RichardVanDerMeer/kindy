<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, Settings, UserRound } from '@lucide/vue'
import { useRouter } from 'vue-router'

import { useKindyStore } from '@/stores/kindy'

import BrandMark from './BrandMark.vue'
import PersonAvatar from './PersonAvatar.vue'

const store = useKindyStore()
const router = useRouter()
const open = ref(false)

function go(path: string): void {
  open.value = false
  void router.push(path)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <header class="view-header">
    <BrandMark compact />
    <div class="me-menu">
      <button
        class="me-button"
        :aria-label="$t('me.menu')"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="open = !open"
      >
        <PersonAvatar
          v-if="store.selfPerson"
          :name="store.selfPerson.displayName"
          :photo-ref="store.selfPerson.photoRef"
          size="tiny"
        />
        <span v-else class="me-button__placeholder"><UserRound :size="18" /></span>
        <span class="me-button__name">{{ store.selfPerson?.givenName ?? $t('me.you') }}</span>
        <ChevronDown :size="16" aria-hidden="true" />
      </button>

      <template v-if="open">
        <button class="menu-scrim" :aria-label="$t('common.close')" @click="open = false" />
        <div class="me-popover card" role="menu">
          <button
            v-if="store.selfPerson"
            class="me-popover__identity me-popover__identity--link"
            role="menuitem"
            :aria-label="$t('me.myProfile')"
            @click="go(`/people/${store.selfPerson.id}`)"
          >
            <PersonAvatar
              :name="store.selfPerson.displayName"
              :photo-ref="store.selfPerson.photoRef"
              size="small"
            />
            <span class="me-popover__name">
              <strong>{{ store.selfPerson.displayName }}</strong>
              <small>{{ $t('me.viewProfile') }}</small>
            </span>
            <ChevronRight :size="18" aria-hidden="true" />
          </button>
          <div v-else class="me-popover__identity">
            <span>
              <strong>{{ $t('me.notSet') }}</strong>
              <small>{{ $t('me.notSetHint') }}</small>
            </span>
          </div>
          <button class="me-popover__item" role="menuitem" @click="go('/settings')">
            <Settings :size="20" /> {{ $t('me.settings') }}
          </button>
        </div>
      </template>
    </div>
  </header>
</template>
