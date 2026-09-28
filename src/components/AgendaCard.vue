<script setup lang="ts">
import { computed } from 'vue'
import {
  Bell,
  BriefcaseBusiness,
  Cake,
  CalendarClock,
  CalendarHeart,
  Check,
  Gift,
  Heart,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  agendaCardText,
  describeAgendaItem,
  firstName,
  primaryPerson,
  yearsText,
} from '@/composables/agendaText'
import { agendaFilterFor, type AgendaItem } from '@/domain/agenda'
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
const text = computed(() => agendaCardText(props.item, people.value, t, locale.value))
/** The full sentence, e.g. "Wordt 12", for screen readers on the circle. */
const detail = computed(() => describeAgendaItem(props.item, people.value, t, locale.value).detail)

const date = computed(() => new Date(`${props.item.date}T12:00:00`))
/** Above the day number: today, tomorrow, or the short weekday. */
const dayLabel = computed(() => {
  const days = props.item.daysFromToday
  if (days === 0) return t('upcoming.today')
  if (days === 1) return t('upcoming.tomorrow')
  return new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(date.value)
})

const icon = computed(() => {
  switch (props.item.kind) {
    case 'birthday':
      return Cake
    case 'wedding-anniversary':
    case 'anniversary':
      return Heart
    case 'work-anniversary':
      return BriefcaseBusiness
    case 'reminder':
      return Bell
    case 'appointment':
      return CalendarClock
    case 'memorial-birth':
    case 'memorial-death':
      // Someone who has died needs no symbol; the card says enough.
      return undefined
    default:
      return CalendarHeart
  }
})

const isMemorial = computed(() => props.item.kind.startsWith('memorial'))

/** Celebrations show their number in a circle: the age, years married or years at work. */
const milestone = computed(() => {
  const { kind, years } = props.item
  if (!years) return undefined
  if (kind === 'birthday') return 'birthday'
  if (kind === 'wedding-anniversary' || kind === 'anniversary') return 'wedding'
  if (kind === 'work-anniversary') return 'work'
  return undefined
})
/** Today's celebrations get a festive card; a day of remembrance a quiet one. */
const mood = computed(() => {
  if (props.item.daysFromToday !== 0) return undefined
  if (isMemorial.value) return 'remembrance'
  return milestone.value ?? (props.item.kind === 'birthday' ? 'birthday' : undefined)
})

function contact(kind: 'phone' | 'email'): string | undefined {
  const points = primary.value?.contactPoints.filter((point) => point.kind === kind) ?? []
  return (points.find((point) => point.isPrimary) ?? points[0])?.value
}

/** Call and message buttons only for this week (and just past); later cards stay calm. */
const reachable = computed(() => props.item.daysFromToday <= 7 && !primary.value?.isDeceased)
const phone = computed(() => (reachable.value ? contact('phone') : undefined))
const email = computed(() => (reachable.value ? contact('email') : undefined))
const whatsappNumber = computed(() => phone.value?.replace(/[^\d]/g, ''))
/** Without other buttons the gift sits next to the circle, and the card stays one row high. */
const hasContactActions = computed(() => Boolean(phone.value || email.value || editable.value))
const giftInRow = computed(() => !props.compact && openWishes.value > 0 && !hasContactActions.value)
const hasActionRow = computed(() => !props.compact && hasContactActions.value)

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
      [`agenda-card--kind-${agendaFilterFor(item.kind)}`]: true,
      'agenda-card--compact': compact,
      'agenda-card--done': item.done,
      [`agenda-card--mood-${mood}`]: mood,
    }"
  >
    <div class="agenda-card__row">
      <button class="agenda-card__main" :disabled="!primary" @click="open">
        <span
          class="agenda-date"
          :class="{ 'agenda-date--today': item.daysFromToday === 0 }"
          :aria-label="date.toLocaleDateString(locale, { dateStyle: 'full' })"
        >
          <small>{{ dayLabel }}</small>
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
        </span>
        <span class="agenda-card__copy">
          <strong>{{ text.headline }}</strong>
          <span v-if="text.familyLine" class="agenda-card__family">{{ text.familyLine }}</span>
          <small
            v-if="text.what"
            class="agenda-card__what"
            :class="{ 'agenda-card__what--title': text.whatIsTitle }"
          >
            <component :is="icon" v-if="icon" :size="14" aria-hidden="true" />
            <span>{{ text.what }}</span>
          </small>
          <small v-if="item.done" class="agenda-card__done">{{ t('upcoming.doneLabel') }}</small>
        </span>
      </button>
      <RouterLink
        v-if="giftInRow && primary"
        class="gift-action"
        :to="{ path: `/people/${primary.id}`, hash: '#wishlist' }"
        :aria-label="t('wishes.giftFor', { name: firstName(primary) })"
      >
        <Gift :size="18" />
        <span class="gift-action__count">{{ openWishes }}</span>
      </RouterLink>
      <span
        v-if="milestone && item.years"
        class="milestone"
        :class="[`milestone--${milestone}`, { 'milestone--today': item.daysFromToday === 0 }]"
        role="img"
        :aria-label="detail"
      >
        <strong>{{ yearsText(item.years) }}</strong>
        <small>{{ t('upcoming.yearsUnit', Math.ceil(item.years)) }}</small>
      </span>
      <button
        v-if="item.kind === 'reminder'"
        class="memo-check"
        role="checkbox"
        :aria-checked="Boolean(item.done)"
        :aria-label="item.done ? t('upcoming.markOpen') : t('upcoming.markDone')"
        @click="store.toggleMemoDone(item.id)"
      >
        <Check v-if="item.done" :size="16" :stroke-width="3" />
      </button>
    </div>
    <div v-if="hasActionRow" class="agenda-card__actions">
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
        class="gift-action"
        :to="{ path: `/people/${primary.id}`, hash: '#wishlist' }"
        :aria-label="t('wishes.giftFor', { name: firstName(primary) })"
      >
        <Gift :size="18" />
        <span class="gift-action__count">{{ openWishes }}</span>
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
