import type { KindyData, Person } from '@/domain/model'

const now = Date.now()

function person(id: string, displayName: string, options: Partial<Person> = {}): Person {
  const [givenName, ...familyName] = displayName.split(' ')
  return {
    id,
    displayName,
    givenName,
    familyName: familyName.join(' '),
    isFavorite: false,
    isArchived: false,
    isDeceased: false,
    contactPoints: [],
    details: [],
    createdAt: now - 80_000,
    updatedAt: now - 3_000,
    ...options,
  }
}

export const demoData: KindyData = {
  schemaVersion: 1,
  people: [
    person('demo-richard', 'Richard van der Meer', {
      isFavorite: true,
      howWeMet: 'Dit ben jij',
      details: [
        {
          id: 'detail-richard-work',
          definitionId: 'occupation',
          label: 'Werk',
          value: 'Product designer',
          valueType: 'text',
          source: 'kindy',
        },
        {
          id: 'detail-richard-interests',
          definitionId: 'interests',
          label: 'Interesses',
          value: 'Technologie, wielrennen, koken',
          valueType: 'text',
          source: 'kindy',
        },
      ],
    }),
    person('demo-sophie', 'Sophie van der Meer', {
      isFavorite: true,
      howWeMet: 'Samen sinds 2011',
    }),
    person('demo-emma', 'Emma van der Meer', { howWeMet: 'Dochter' }),
    person('demo-lucas', 'Lucas van der Meer', { howWeMet: 'Zoon' }),
    person('demo-henk', 'Henk van der Meer', { howWeMet: 'Vader' }),
    person('demo-els', 'Els van der Meer', { howWeMet: 'Moeder' }),
    person('demo-robin', 'Robin Chen', {
      isFavorite: true,
      howWeMet: 'Vrienden sinds de middelbare school',
    }),
  ],
  externalIdentities: [],
  circles: [
    {
      id: 'circle-family',
      name: 'Familie',
      colorToken: 'family',
      iconKey: 'home',
      isArchived: false,
    },
    {
      id: 'circle-friends',
      name: 'Vrienden',
      colorToken: 'team',
      iconKey: 'users',
      isArchived: false,
    },
    {
      id: 'circle-work',
      name: 'Werk',
      colorToken: 'work',
      iconKey: 'briefcase',
      isArchived: false,
    },
  ],
  memberships: [
    ...['demo-richard', 'demo-sophie', 'demo-emma', 'demo-lucas', 'demo-henk', 'demo-els'].map(
      (personId) => ({ circleId: 'circle-family', personId }),
    ),
    { circleId: 'circle-friends', personId: 'demo-richard' },
    { circleId: 'circle-friends', personId: 'demo-robin', role: 'Goede vriend' },
    { circleId: 'circle-work', personId: 'demo-richard', role: 'Product' },
  ],
  relationships: [
    {
      id: 'relationship-richard-sophie',
      fromPersonId: 'demo-richard',
      toPersonId: 'demo-sophie',
      type: 'partner-of',
      customLabel: 'Echtgenote',
    },
    {
      id: 'relationship-richard-emma',
      fromPersonId: 'demo-richard',
      toPersonId: 'demo-emma',
      type: 'parent-of',
      customLabel: 'Dochter',
    },
    {
      id: 'relationship-richard-lucas',
      fromPersonId: 'demo-richard',
      toPersonId: 'demo-lucas',
      type: 'parent-of',
      customLabel: 'Zoon',
    },
    {
      id: 'relationship-henk-richard',
      fromPersonId: 'demo-henk',
      toPersonId: 'demo-richard',
      type: 'parent-of',
      customLabel: 'Vader',
    },
    {
      id: 'relationship-els-richard',
      fromPersonId: 'demo-els',
      toPersonId: 'demo-richard',
      type: 'parent-of',
      customLabel: 'Moeder',
    },
    {
      id: 'relationship-richard-robin',
      fromPersonId: 'demo-richard',
      toPersonId: 'demo-robin',
      type: 'friend-of',
      customLabel: 'Goede vriend',
    },
  ],
  notes: [
    {
      id: 'note-richard',
      body: 'Volgende maand met Robin gaan fietsen. Route langs de kust uitzoeken.',
      personIds: ['demo-richard', 'demo-robin'],
      occurredAt: now - 86_400_000,
      isPinned: true,
      createdAt: now - 86_400_000,
      updatedAt: now - 86_400_000,
    },
  ],
  events: [
    {
      id: 'event-sophie-birthday',
      type: 'birthday',
      title: 'Verjaardag van Sophie',
      date: {
        year: null,
        month: new Date(now + 86_400_000).getUTCMonth() + 1,
        day: new Date(now + 86_400_000).getUTCDate(),
      },
      personIds: ['demo-sophie'],
      source: 'kindy',
    },
  ],
  reminders: [
    {
      id: 'reminder-robin',
      personId: 'demo-robin',
      title: 'Robin bellen over de fietsroute',
      localDateTime: '2026-09-26T10:00:00',
      timezone: 'Europe/Amsterdam',
      recurrence: { kind: 'once' },
      notificationOffsetsMinutes: [0],
      isCancelled: false,
    },
  ],
  reminderOccurrences: [
    {
      id: 'occurrence-robin',
      reminderId: 'reminder-robin',
      dueAt: now + 7 * 86_400_000,
      state: 'scheduled',
    },
  ],
  interactions: [],
}
