<script setup lang="ts">
import { computed } from 'vue'
import {
  Bell,
  Cake,
  CalendarClock,
  CalendarHeart,
  Check,
  Flower2,
  Gift,
  Heart,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { describeAgendaItem, firstName, primaryPerson } from '@/composables/agendaText'
import type { AgendaItem } from '@/domain/agenda'
import type { Person } from '@/domain/model'
import { useEditorsStore } from '@/stores/editors'
import { useKindyStore } from '@/stores/kindy'

import PersonAvatar from './PersonAvatar.vue'

const props = withDefaults(defineProps<{ item: AgendaItem; compact?: boolean }>(), {
  compact: false,
})

const store = useKindyStore()
const editors = useEditorsStore()
const editable = computed(() => props.item.kind === 'reminder' || props.item.kind === 'appointment')

function edit(): void {
  if (props.item.kind === 'reminder') editors.editMemo(props.item.id)
  else if (props.item.kind === 'appointment') editors.editAppointment(props.item.id)
}
const router = useRouter()
const { t, locale } = useI18n()

const people = computed(() =>
  props.item.personIds
    .map((id) => store.personById(id))
    .filter((person): person is Person => Boolean(person)),
)
const primary = computed(() => primaryPerson(people.value))
/** Wedding days, anniversaries and shared appointments show two people when known. */
const couple = computed(() =>
  (props.item.kind === 'wedding-anniversary' ||
    props.item.kind === 'anniversary' ||
    props.item.kind === 'appointment') &&
  people.value.length >= 2
    ? people.value.slice(0, 2)
    : undefined,
)
/** Open wishes turn a birthday into a reminder of gift ideas. */
const openWishes = computed(() =>
  props.item.kind === 'birthday' && primary.value
    ? store.wishesFor(primary.value.id).filter((wish) => wish.status !== 'given').length
    : 0,
)
const text = computed(() => describeAgendaItem(props.item, people.value, t, locale.value))
const title = computed(() => text.value.title)
const detail = computed(() => text.value.detail)

const date = computed(() => new Date(`${props.item.date}T12:00:00`))
const relativeDay = computed(() => {
  const days = props.item.daysFromToday
  if (days === 0) return t('upcoming.today')
  if (days === 1) return t('upcoming.tomorrow')
  if (days === -1) return t('upcoming.yesterday')
  if (days < 0) return t('upcoming.daysAgo', { count: -days })
  if (days < 7) return new Intl.DateTimeFormat(locale.value, { weekday: 'long' }).format(date.value)
  return t('upcoming.inDays', { count: days })
})

const icon = computed(() => {
  switch (props.item.kind) {
    case 'birthday':
      return Cake
    case 'wedding-anniversary':
    case 'anniversary':
      return Heart
    case 'memorial-birth':
    case 'memorial-death':
      return Flower2
    case 'reminder':
      return Bell
    case 'appointment':
      return CalendarClock
    default:
      return CalendarHeart
  }
})

const isMemorial = computed(() => props.item.kind.startsWith('memorial'))

function contact(kind: 'phone' | 'email'): string | undefined {
  const points = primary.value?.contactPoints.filter((point) => point.kind === kind) ?? []
  return (points.find((point) => point.isPrimary) ?? points[0])?.value
}

const phone = computed(() => (primary.value?.isDeceased ? undefined : contact('phone')))
const email = computed(() => (primary.value?.isDeceased ? undefined : contact('email')))
const whatsappNumber = computed(() => phone.value?.replace(/[^\d]/g, ''))

function open(): void {
  if (primary.value) void router.push(`/people/${primary.value.id}`)
}
</script>

<template>
  <article
    class="agenda-card card"
    :class="{
      'agenda-card--today': item.daysFromToday === 0,
      'agenda-card--past': item.daysFromToday < 0,
      'agenda-card--memorial': isMemorial,
      'agenda-card--compact': compact,
    }"
  >
    <button class="agenda-card__main" :disabled="!primary" @click="open">
      <span class="agenda-date" :aria-label="date.toLocaleDateString(locale)">
        <strong>{{ new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(date) }}</strong>
        <span>{{ new Intl.DateTimeFormat(locale, { month: 'short' }).format(date) }}</span>
      </span>
      <span class="agenda-card__visual" :class="{ 'agenda-card__visual--pair': couple }">
        <span v-if="couple" class="avatar-pair">
          <PersonAvatar
            v-for="partner in couple"
            :key="partner.id"
            :name="partner.displayName"
            :photo-ref="partner.photoRef"
            :deceased="partner.isDeceased"
            size="tiny"
          />
        </span>
        <PersonAvatar
          v-else-if="primary"
          :name="primary.displayName"
          :photo-ref="primary.photoRef"
          :deceased="primary.isDeceased"
          size="small"
        />
        <span class="agenda-card__badge" aria-hidden="true">
          <component :is="icon" :size="13" />
        </span>
      </span>
      <span class="agenda-card__copy">
        <span class="agenda-card__when">
          <span v-if="item.daysFromToday === 0" class="today-pill">{{ relativeDay }}</span>
          <template v-else>{{ relativeDay }}</template>
        </span>
        <strong>{{ title }}</strong>
        <small v-if="detail">{{ detail }}</small>
      </span>
    </button>
    <div v-if="!compact && (phone || email || openWishes || editable)" class="agenda-card__actions">
      <button
        v-if="item.kind === 'reminder'"
        class="contact-action contact-action--done"
        :aria-label="t('upcoming.markDone')"
        @click="store.completeMemo(item.id)"
      >
        <Check :size="18" /> <span>{{ t('upcoming.done') }}</span>
      </button>
      <button
        v-if="editable"
        class="contact-action"
        :class="{ 'contact-action--first': item.kind !== 'reminder' }"
        :aria-label="t('editors.edit')"
        @click="edit"
      >
        <Pencil :size="17" />
      </button>
      <RouterLink
        v-if="openWishes && primary"
        class="contact-action contact-action--gift"
        :to="{ path: `/people/${primary.id}`, hash: '#wishlist' }"
        :aria-label="t('wishes.giftFor', { name: firstName(primary) })"
      >
        <Gift :size="18" /> <span>{{ openWishes }}</span>
      </RouterLink>
      <a
        v-if="phone"
        class="contact-action"
        :href="`tel:${phone}`"
        :aria-label="t('upcoming.call', { name: primary && firstName(primary) })"
      >
        <Phone :size="18" />
      </a>
      <a
        v-if="whatsappNumber"
        class="contact-action contact-action--whatsapp"
        :href="`https://wa.me/${whatsappNumber}`"
        target="_blank"
        rel="noopener"
        :aria-label="t('upcoming.whatsapp', { name: primary && firstName(primary) })"
      >
        <MessageCircle :size="18" />
      </a>
      <a
        v-if="email"
        class="contact-action"
        :href="`mailto:${email}`"
        :aria-label="t('upcoming.email', { name: primary && firstName(primary) })"
      >
        <Mail :size="18" />
      </a>
    </div>
  </article>
</template>
