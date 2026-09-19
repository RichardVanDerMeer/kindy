<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronRight, Search } from '@lucide/vue'
import { useRouter } from 'vue-router'

import PersonAvatar from '@/components/PersonAvatar.vue'
import ViewHeader from '@/components/ViewHeader.vue'
import type { Person } from '@/domain/model'
import { useKindyStore } from '@/stores/kindy'

const store = useKindyStore()
const router = useRouter()
const query = ref('')
const results = ref<Person[]>([])

watch(query, async (value) => {
  results.value = value.trim() ? await store.search(value) : []
})
</script>

<template>
  <section class="view">
    <ViewHeader />
    <h1>{{ $t('search.title') }}</h1>
    <label class="search-field search-field--large">
      <Search :size="22" />
      <input v-model="query" type="search" :placeholder="$t('search.placeholder')" autofocus />
    </label>
    <p v-if="!query" class="search-hint">{{ $t('search.hint') }}</p>
    <div v-else-if="results.length" class="person-list card">
      <button
        v-for="(person, index) in results"
        :key="person.id"
        class="person-row person-row--button"
        @click="router.push(`/people/${person.id}`)"
      >
        <PersonAvatar :name="person.displayName" :tone="index" />
        <span class="person-row__copy"><strong>{{ person.displayName }}</strong></span>
        <ChevronRight :size="21" />
      </button>
    </div>
    <div v-else-if="query" class="empty-state card"><h2>{{ $t('search.noResults') }}</h2></div>
  </section>
</template>
