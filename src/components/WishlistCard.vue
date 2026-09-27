<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ExternalLink, Gift, Plus } from '@lucide/vue'

import type { WishItem } from '@/domain/model'
import { useKindyStore } from '@/stores/kindy'

import WishDialog from './WishDialog.vue'

const props = defineProps<{ personId: string }>()
const store = useKindyStore()
const editing = ref<WishItem>()
const showDialog = ref(false)
const showGiven = ref(false)

const wishes = computed(() => store.wishesFor(props.personId))
/** Open ideas first; bought gifts next, so they are not bought twice. */
const current = computed(() =>
  wishes.value
    .filter((wish) => wish.status !== 'given')
    .sort((left, right) => Number(left.status === 'bought') - Number(right.status === 'bought')),
)
const given = computed(() => wishes.value.filter((wish) => wish.status === 'given'))

function open(wish?: WishItem): void {
  editing.value = wish
  showDialog.value = true
}

async function save(input: Pick<WishItem, 'title' | 'url' | 'note' | 'status'>): Promise<void> {
  await store.saveWish({ ...input, id: editing.value?.id, personId: props.personId })
  showDialog.value = false
}

async function remove(): Promise<void> {
  if (editing.value) await store.removeWish(editing.value.id)
  showDialog.value = false
}

/** Tapping the status moves a wish along: idea → bought → given. */
async function advance(wish: WishItem): Promise<void> {
  const next: Record<WishItem['status'], WishItem['status']> = {
    idea: 'bought',
    bought: 'given',
    given: 'idea',
  }
  await store.saveWish({ ...wish, status: next[wish.status] })
}
</script>

<template>
  <article id="wishlist" class="card profile-card wishlist-card">
    <div class="card-heading-row card-heading-row--wrap">
      <h2><Gift :size="18" /> {{ $t('wishes.title') }}</h2>
      <button class="section-link" @click="open()">
        <Plus :size="16" /> {{ $t('wishes.add') }}
      </button>
    </div>
    <p v-if="!current.length && !given.length" class="muted">{{ $t('wishes.empty') }}</p>
    <div v-for="wish in current" :key="wish.id" class="wish-row">
      <button class="wish-row__main" @click="open(wish)">
        <strong :class="{ 'wish-row__title--bought': wish.status === 'bought' }">{{
          wish.title
        }}</strong>
        <small v-if="wish.note">{{ wish.note }}</small>
      </button>
      <a
        v-if="wish.url"
        class="icon-button"
        :href="wish.url"
        target="_blank"
        rel="noopener"
        :aria-label="$t('wishes.openLink')"
      >
        <ExternalLink :size="17" />
      </a>
      <button class="wish-status" :class="`wish-status--${wish.status}`" @click="advance(wish)">
        {{ $t(`wishes.status.${wish.status}`) }}
      </button>
    </div>
    <template v-if="given.length">
      <button class="earlier-toggle" :aria-expanded="showGiven" @click="showGiven = !showGiven">
        <ChevronDown :size="16" /> {{ $t('wishes.given', { count: given.length }) }}
      </button>
      <template v-if="showGiven">
        <div v-for="wish in given" :key="wish.id" class="wish-row wish-row--given">
          <button class="wish-row__main" @click="open(wish)">
            <strong>{{ wish.title }}</strong>
          </button>
          <button class="wish-status wish-status--given" @click="advance(wish)">
            {{ $t('wishes.status.given') }}
          </button>
        </div>
      </template>
    </template>
    <WishDialog
      :open="showDialog"
      :wish="editing"
      @close="showDialog = false"
      @save="save"
      @remove="remove"
    />
  </article>
</template>
