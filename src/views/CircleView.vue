<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, ChevronRight, Pencil, Star, UserRoundPlus } from '@lucide/vue'
import { useRouter } from 'vue-router'

import AgendaCard from '@/components/AgendaCard.vue'
import CircleEditDialog from '@/components/CircleEditDialog.vue'
import { circleIcon } from '@/components/circleIcons'
import PersonAvatar from '@/components/PersonAvatar.vue'
import PersonPicker from '@/components/PersonPicker.vue'
import type { Circle } from '@/domain/model'
import { useKindyStore } from '@/stores/kindy'

const props = defineProps<{ id: string }>()
const store = useKindyStore()
const router = useRouter()
const showEditor = ref(false)
const showMembers = ref(false)
const memberSelection = ref<string[]>([])

const circle = computed(() => store.circles.find((candidate) => candidate.id === props.id))

/** Favourites first, then alphabetical; the user themselves goes last. */
const members = computed(() => {
  const roles = new Map(
    (store.data?.memberships ?? [])
      .filter((membership) => membership.circleId === props.id && !membership.endedOn)
      .map((membership) => [membership.personId, membership.role]),
  )
  return store
    .circleMembers(props.id)
    .map((person) => ({ person, role: roles.get(person.id) }))
    .sort(
      (left, right) =>
        Number(left.person.isSelf ?? false) - Number(right.person.isSelf ?? false) ||
        Number(right.person.isFavorite) - Number(left.person.isFavorite) ||
        left.person.displayName.localeCompare(right.person.displayName),
    )
})

const upcoming = computed(() => {
  const ids = new Set(members.value.map((member) => member.person.id))
  return store.agenda
    .filter(
      (item) =>
        item.daysFromToday >= 0 &&
        item.daysFromToday <= 30 &&
        item.personIds.some((personId) => ids.has(personId)),
    )
    .slice(0, 3)
})

function openMembers(): void {
  memberSelection.value = members.value.map((member) => member.person.id)
  showMembers.value = true
}

async function saveMembers(): Promise<void> {
  await store.setCircleMembers(props.id, memberSelection.value)
  showMembers.value = false
}

async function saveCircle(updated: Circle): Promise<void> {
  await store.saveCircle(updated)
  showEditor.value = false
}
</script>

<template>
  <section v-if="circle" class="view circle-view">
    <header class="profile-toolbar">
      <button class="icon-button" :aria-label="$t('common.back')" @click="router.back()">
        <ArrowLeft :size="24" />
      </button>
      <span class="header-actions">
        <button class="icon-button" :aria-label="$t('circles.edit')" @click="showEditor = true">
          <Pencil :size="21" />
        </button>
        <button
          class="icon-button icon-button--star"
          :aria-label="$t('circles.favorite')"
          :aria-pressed="circle.isFavorite"
          @click="store.toggleCircleFavorite(circle.id)"
        >
          <Star :size="24" :fill="circle.isFavorite ? 'currentColor' : 'none'" />
        </button>
      </span>
    </header>

    <div
      class="circle-hero"
      :class="[
        `surface--${circle.colorToken}`,
        { 'circle-card--image': circle.backgroundImageRef },
      ]"
    >
      <img
        v-if="circle.backgroundImageRef"
        class="circle-card__image"
        :src="circle.backgroundImageRef"
        alt=""
      />
      <span class="circle-card__icon" aria-hidden="true">
        <component :is="circleIcon(circle.iconKey)" :size="26" />
      </span>
      <div class="circle-hero__copy">
        <h1>{{ circle.name }}</h1>
        <p>
          {{ $t('circles.members', { count: members.length }, members.length) }}
          <template v-if="circle.description"> · {{ circle.description }}</template>
        </p>
      </div>
    </div>

    <section v-if="upcoming.length" class="home-section">
      <h2 class="section-title">{{ $t('circles.upcomingHere') }}</h2>
      <div class="timeline-list">
        <AgendaCard v-for="item in upcoming" :key="item.id" :item="item" compact />
      </div>
    </section>

    <section class="home-section">
      <header class="section-header">
        <h2 class="section-title">{{ $t('circles.membersTitle') }}</h2>
        <button class="section-link" @click="openMembers">
          <UserRoundPlus :size="16" /> {{ $t('circles.manageMembers') }}
        </button>
      </header>
      <div v-if="members.length" class="person-list card">
        <button
          v-for="member in members"
          :key="member.person.id"
          class="person-row person-row--button"
          :class="{ 'person-row--deceased': member.person.isDeceased }"
          @click="router.push(`/people/${member.person.id}`)"
        >
          <PersonAvatar
            :name="member.person.displayName"
            :photo-ref="member.person.photoRef"
            :deceased="member.person.isDeceased"
          />
          <span class="person-row__copy">
            <strong>{{ member.person.displayName }}</strong>
            <span>{{
              member.person.isSelf
                ? $t('me.you')
                : member.person.isDeceased
                  ? $t('memorial.inMemory')
                  : member.role
            }}</span>
          </span>
          <Star
            v-if="member.person.isFavorite"
            class="member-star"
            :size="18"
            fill="currentColor"
            :aria-label="$t('profile.favorite')"
          />
          <ChevronRight :size="21" aria-hidden="true" />
        </button>
      </div>
      <p v-else class="empty-copy card">{{ $t('circles.noMembers') }}</p>
    </section>

    <CircleEditDialog
      :open="showEditor"
      :circle="circle"
      @close="showEditor = false"
      @save="saveCircle"
    />
    <Teleport to="body">
      <div v-if="showMembers" class="dialog-backdrop" @click.self="showMembers = false">
        <div class="dialog dialog--scroll" role="dialog" aria-modal="true">
          <div class="dialog__handle" aria-hidden="true"></div>
          <h2>{{ $t('circles.manageMembersOf', { name: circle.name }) }}</h2>
          <PersonPicker v-model="memberSelection" :candidates="store.people" />
          <div class="dialog__actions">
            <button type="button" class="button button--ghost" @click="showMembers = false">
              {{ $t('people.cancel') }}
            </button>
            <button type="button" class="button button--primary" @click="saveMembers">
              {{ $t('circles.pickSave') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
  <section v-else class="center-state">
    <p>{{ $t('circles.empty') }}</p>
    <button class="button button--primary" @click="router.push('/circles')">
      {{ $t('common.back') }}
    </button>
  </section>
</template>
