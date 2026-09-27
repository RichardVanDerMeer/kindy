<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { isValidPartialDate } from '@/domain/dates'
import type { PartialDate } from '@/domain/model'

/** Day, month and an optional year; emits undefined until the date is valid. */
const date = defineModel<PartialDate | undefined>({ required: true })
const { locale } = useI18n()

const day = ref(date.value?.day ?? 0)
const month = ref(date.value?.month ?? 0)
const year = ref(date.value?.year ? String(date.value.year) : '')

const months = computed(() =>
  Array.from({ length: 12 }, (_, index) => ({
    value: index + 1,
    label: new Intl.DateTimeFormat(locale.value, { month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, index, 1)),
    ),
  })),
)

watch([day, month, year], () => {
  const parsedYear = year.value.trim() ? Number(year.value) : null
  const candidate: PartialDate = { day: day.value, month: month.value, year: parsedYear }
  const yearOk = parsedYear === null || (Number.isInteger(parsedYear) && parsedYear > 1800)
  date.value = yearOk && isValidPartialDate(candidate) ? candidate : undefined
})
</script>

<template>
  <div class="partial-date">
    <label>
      <span class="sr-only">{{ $t('dates.day') }}</span>
      <select v-model.number="day" required>
        <option :value="0" disabled>{{ $t('dates.day') }}</option>
        <option v-for="value in 31" :key="value" :value="value">{{ value }}</option>
      </select>
    </label>
    <label>
      <span class="sr-only">{{ $t('dates.month') }}</span>
      <select v-model.number="month" required>
        <option :value="0" disabled>{{ $t('dates.month') }}</option>
        <option v-for="option in months" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
    <label>
      <span class="sr-only">{{ $t('dates.yearOptional') }}</span>
      <input
        v-model="year"
        inputmode="numeric"
        maxlength="4"
        :placeholder="$t('dates.yearOptional')"
      />
    </label>
  </div>
</template>
