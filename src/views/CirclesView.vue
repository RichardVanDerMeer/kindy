<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus } from '@lucide/vue'
import { useRouter } from 'vue-router'

import CircleCard from '@/components/CircleCard.vue'
import CircleEditDialog from '@/components/CircleEditDialog.vue'
import ViewHeader from '@/components/ViewHeader.vue'
import type { Circle } from '@/domain/model'
import { useKindyStore } from '@/stores/kindy'

const store = useKindyStore()
const router = useRouter()
const editing = ref<Circle>()
const showEditor = ref(false)

/** Favourite circles first, the rest keeps its own order. */
const ordered = computed(() =>
  [...store.circles].sort((left, right) => Number(right.isFavorite) - Number(left.isFavorite)),
)

function edit(circle?: Circle): void {
  editing.value = circle
  showEditor.value = true
}

async function save(circle: Circle): Promise<void> {
  await store.saveCircle(circle)
  showEditor.value = false
}
</script>

<template>
  <section class="view">
    <ViewHeader />
    <h1>{{ $t('circles.title') }}</h1>
    <div v-if="ordered.length" class="circle-list">
      <CircleCard
        v-for="circle in ordered"
        :key="circle.id"
        :circle="circle"
        @open="router.push({ path: '/people', query: { circle: circle.id } })"
        @edit="edit(circle)"
      />
    </div>
    <div v-else class="empty-state card">
      <h2>{{ $t('circles.empty') }}</h2>
    </div>

    <button class="floating-action" :aria-label="$t('circles.add')" @click="edit()">
      <Plus :size="32" />
    </button>
    <CircleEditDialog
      :open="showEditor"
      :circle="editing"
      @close="showEditor = false"
      @save="save"
    />
  </section>
</template>
