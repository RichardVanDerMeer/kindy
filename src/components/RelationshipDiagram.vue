<script setup lang="ts">
import { computed } from 'vue'
import { Heart, Sparkles, UsersRound } from '@lucide/vue'

import PersonAvatar from '@/components/PersonAvatar.vue'
import type { Person, RelationshipType } from '@/domain/model'

export interface DisplayRelationship {
  id: string
  displayType: RelationshipType
  customLabel?: string
  person?: Person
}

const props = defineProps<{
  person: Person
  relationships: DisplayRelationship[]
}>()

const emit = defineEmits<{ select: [personId: string] }>()

const parents = computed(() =>
  props.relationships.filter((relationship) => relationship.displayType === 'child-of'),
)
const partners = computed(() =>
  props.relationships.filter((relationship) => relationship.displayType === 'partner-of'),
)
const children = computed(() =>
  props.relationships.filter((relationship) => relationship.displayType === 'parent-of'),
)
const friends = computed(() =>
  props.relationships.filter((relationship) => relationship.displayType === 'friend-of'),
)
const otherConnections = computed(() =>
  props.relationships.filter(
    (relationship) =>
      !['child-of', 'partner-of', 'parent-of', 'friend-of'].includes(relationship.displayType),
  ),
)

function select(person?: Person): void {
  if (person) emit('select', person.id)
}
</script>

<template>
  <div class="connections-layout">
    <article v-if="parents.length || partners.length || children.length" class="card family-map">
      <header class="connection-section-heading">
        <span class="section-icon section-icon--family"><UsersRound :size="20" /></span>
        <span>
          <h2>{{ $t('connections.family') }}</h2>
          <p>{{ $t('connections.familyHint') }}</p>
        </span>
      </header>

      <div v-if="parents.length" class="family-generation family-generation--parents">
        <span class="generation-label">{{ $t('connections.parents') }}</span>
        <div class="family-people family-people--paired">
          <button
            v-for="(relationship, index) in parents"
            :key="relationship.id"
            class="connection-person"
            @click="select(relationship.person)"
          >
            <PersonAvatar
              v-if="relationship.person"
              :name="relationship.person.displayName"
              size="medium"
              :tone="index + 2"
            />
            <strong>{{ relationship.person?.displayName }}</strong>
            <small>{{ relationship.customLabel || $t('connections.parent') }}</small>
          </button>
        </div>
      </div>

      <div
        v-if="parents.length"
        class="family-connector family-connector--down"
        aria-hidden="true"
      />

      <div class="family-generation family-generation--current">
        <div class="family-people family-people--paired family-people--couple">
          <div class="connection-person connection-person--subject">
            <PersonAvatar :name="person.displayName" :photo-ref="person.photoRef" size="medium" />
            <strong>{{ person.displayName }}</strong>
            <small>{{ $t('connections.you') }}</small>
          </div>

          <template v-for="(relationship, index) in partners" :key="relationship.id">
            <div class="couple-link" aria-hidden="true">
              <Heart :size="17" fill="currentColor" />
            </div>
            <button class="connection-person" @click="select(relationship.person)">
              <PersonAvatar
                v-if="relationship.person"
                :name="relationship.person.displayName"
                size="medium"
                :tone="index + 1"
              />
              <strong>{{ relationship.person?.displayName }}</strong>
              <small>{{ relationship.customLabel || $t('connections.partner') }}</small>
            </button>
          </template>
        </div>
      </div>

      <div
        v-if="children.length"
        class="family-connector family-connector--branch"
        aria-hidden="true"
      />

      <div v-if="children.length" class="family-generation family-generation--children">
        <span class="generation-label">{{ $t('connections.children') }}</span>
        <div class="family-people family-people--children">
          <button
            v-for="(relationship, index) in children"
            :key="relationship.id"
            class="connection-person"
            @click="select(relationship.person)"
          >
            <PersonAvatar
              v-if="relationship.person"
              :name="relationship.person.displayName"
              size="medium"
              :tone="index + 1"
            />
            <strong>{{ relationship.person?.displayName }}</strong>
            <small>{{ relationship.customLabel || $t('connections.child') }}</small>
          </button>
        </div>
      </div>
    </article>

    <article v-if="friends.length" class="card friends-card">
      <header class="connection-section-heading">
        <span class="section-icon section-icon--friends"><Sparkles :size="20" /></span>
        <span>
          <h2>{{ $t('connections.friends') }}</h2>
          <p>{{ $t('connections.friendsHint') }}</p>
        </span>
      </header>

      <button
        v-for="(relationship, index) in friends"
        :key="relationship.id"
        class="friend-connection"
        @click="select(relationship.person)"
      >
        <PersonAvatar
          v-if="relationship.person"
          :name="relationship.person.displayName"
          size="medium"
          :tone="index + 3"
        />
        <span class="friend-connection__copy">
          <strong>{{ relationship.person?.displayName }}</strong>
          <small>{{ relationship.customLabel || $t('connections.friend') }}</small>
        </span>
        <span class="friend-link" aria-hidden="true">
          <span />
          <Heart :size="17" />
        </span>
        <PersonAvatar :name="person.displayName" :photo-ref="person.photoRef" size="small" />
      </button>
    </article>

    <article v-if="otherConnections.length" class="card other-connections">
      <h2>{{ $t('connections.other') }}</h2>
      <button
        v-for="relationship in otherConnections"
        :key="relationship.id"
        class="connection-row"
        @click="select(relationship.person)"
      >
        <PersonAvatar
          v-if="relationship.person"
          :name="relationship.person.displayName"
          size="small"
        />
        <span>
          <strong>{{ relationship.person?.displayName }}</strong>
          <small>{{ relationship.customLabel || relationship.displayType }}</small>
        </span>
      </button>
    </article>
  </div>
</template>
