import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type { KindyData, Person, UpcomingItem } from '@/domain/model'
import { getKindyRepository } from '@/infrastructure/repositories/repository'

const repository = getKindyRepository()

export const useKindyStore = defineStore('kindy', () => {
  const initialized = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const data = ref<KindyData | null>(null)
  const upcoming = ref<UpcomingItem[]>([])

  const people = computed(() =>
    (data.value?.people ?? [])
      .filter((person) => !person.deletedAt && !person.isArchived)
      .sort((left, right) => left.displayName.localeCompare(right.displayName)),
  )
  const circles = computed(() => (data.value?.circles ?? []).filter((circle) => !circle.isArchived))

  async function initialize(): Promise<void> {
    if (initialized.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      await repository.initialize()
      await refresh()
      initialized.value = true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  async function refresh(): Promise<void> {
    data.value = await repository.getData()
    upcoming.value = await repository.listUpcoming(Date.now(), 20)
  }

  async function savePerson(person: Person): Promise<void> {
    await repository.savePerson(person)
    await refresh()
  }

  async function addPerson(input: { displayName: string; howWeMet?: string }): Promise<Person> {
    const now = Date.now()
    const person: Person = {
      id: crypto.randomUUID(),
      displayName: input.displayName.trim(),
      howWeMet: input.howWeMet?.trim() || undefined,
      isFavorite: false,
      isArchived: false,
      isDeceased: false,
      contactPoints: [],
      details: [],
      createdAt: now,
      updatedAt: now,
    }
    await savePerson(person)
    return person
  }

  async function toggleFavorite(personId: string): Promise<void> {
    const person = await repository.getPerson(personId)
    if (!person) return
    person.isFavorite = !person.isFavorite
    person.updatedAt = Date.now()
    await savePerson(person)
  }

  async function search(query: string): Promise<Person[]> {
    return repository.search(query)
  }

  function circleMemberships(personId: string) {
    return (data.value?.memberships ?? [])
      .filter((membership) => membership.personId === personId && !membership.endedOn)
      .map((membership) => ({
        ...membership,
        circle: data.value?.circles.find((circle) => circle.id === membership.circleId),
      }))
  }

  return {
    initialized,
    loading,
    error,
    data,
    people,
    circles,
    upcoming,
    initialize,
    refresh,
    savePerson,
    addPerson,
    toggleFavorite,
    search,
    circleMemberships,
  }
})
