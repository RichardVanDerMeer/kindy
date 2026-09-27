import {
  KINDY_SCHEMA_VERSION,
  type ContactPoint,
  type KindyData,
  type PartialDate,
  type Person,
  type Relationship,
  type WishItem,
} from '@/domain/model'

const now = Date.now()
const DAY = 86_400_000

/** A date relative to today, so the demo always has something coming up. */
function inDays(offset: number, year: number | null): PartialDate {
  const date = new Date(now + offset * DAY)
  return { year, month: date.getMonth() + 1, day: date.getDate() }
}

function at(offsetDays: number, hour: number): number {
  const date = new Date(now + offsetDays * DAY)
  date.setHours(hour, 0, 0, 0)
  return date.getTime()
}

function contact(
  personId: string,
  kind: ContactPoint['kind'],
  value: string,
  label = kind === 'phone' ? 'Mobiel' : 'Privé',
): ContactPoint {
  return {
    id: `${personId}-${kind}`,
    kind,
    label,
    value,
    normalizedValue: kind === 'phone' ? value.replace(/[^\d+]/g, '') : value.toLocaleLowerCase(),
    isPrimary: true,
    source: 'kindy',
  }
}

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

function wish(
  id: string,
  personId: string,
  title: string,
  status: WishItem['status'],
  note?: string,
): WishItem {
  return { id, personId, title, status, note, createdAt: now - DAY, updatedAt: now - DAY }
}

function avatar(name: string): string {
  return `${import.meta.env.BASE_URL}demo-avatars/${name}.svg`
}

function connection(
  id: string,
  fromPersonId: string,
  toPersonId: string,
  type: Relationship['type'],
  fromPersonRole: Relationship['fromPersonRole'],
  toPersonRole: Relationship['toPersonRole'],
): Relationship {
  return { id, fromPersonId, toPersonId, type, fromPersonRole, toPersonRole }
}

export const demoData: KindyData = {
  schemaVersion: KINDY_SCHEMA_VERSION,
  people: [
    person('demo-richard', 'Richard van der Meer', {
      isSelf: true,
      birthDate: inDays(40, 1984),
      contactPoints: [contact('demo-richard', 'phone', '+31 6 12345600')],
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
      photoRef: avatar('sophie'),
      birthDate: inDays(12, 1986),
      contactPoints: [
        contact('demo-sophie', 'phone', '+31 6 12345601'),
        contact('demo-sophie', 'email', 'sophie@example.com'),
        contact('demo-sophie', 'address', 'Oudegracht 120, 3511 AZ Utrecht', 'Thuis'),
      ],
    }),
    person('demo-emma', 'Emma van der Meer', {
      photoRef: avatar('emma'),
      birthDate: inDays(0, 2014),
      contactPoints: [contact('demo-emma', 'phone', '+31 6 12345602')],
    }),
    person('demo-lucas', 'Lucas van der Meer', {
      photoRef: avatar('lucas'),
      birthDate: inDays(26, 2017),
    }),
    person('demo-henk', 'Henk van der Meer', {
      isDeceased: true,
      birthDate: { year: 1948, month: 2, day: 3 },
      deathDate: inDays(-2, 2024),
      memorialNote: 'Geliefde vader en opa. Altijd in voor een goed verhaal.',
    }),
    person('demo-els', 'Els van der Meer', {
      isFavorite: true,
      birthDate: inDays(-3, 1952),
      contactPoints: [
        contact('demo-els', 'phone', '+31 6 12345603'),
        contact('demo-els', 'email', 'els@example.com'),
        contact('demo-els', 'address', 'Dorpsstraat 8, 8401 AB Gorredijk', 'Thuis'),
      ],
    }),
    person('demo-robin', 'Robin Chen', {
      isFavorite: true,
      photoRef: avatar('robin'),
      birthDate: inDays(5, 1985),
      contactPoints: [
        contact('demo-robin', 'phone', '+31 6 23456701'),
        contact('demo-robin', 'email', 'robin@example.com'),
        contact('demo-robin', 'address', 'Wilhelminapark 3, 3581 NA Utrecht', 'Thuis'),
      ],
    }),
    person('demo-daan', 'Daan Visser', {
      isFavorite: true,
      photoRef: avatar('daan'),
      birthDate: inDays(48, 1983),
      contactPoints: [contact('demo-daan', 'phone', '+31 6 23456702')],
    }),
    person('demo-sanne', 'Sanne de Jong', {
      photoRef: avatar('sanne'),
      birthDate: inDays(3, null),
      contactPoints: [contact('demo-sanne', 'email', 'sanne@example.com')],
    }),
    person('demo-mehmet', 'Mehmet Yılmaz', {
      photoRef: avatar('mehmet'),
      contactPoints: [contact('demo-mehmet', 'phone', '+31 6 23456704')],
    }),
    person('demo-lotte', 'Lotte Bakker', { photoRef: avatar('lotte') }),
    person('demo-jeroen', 'Jeroen Smit'),
    person('demo-noor', 'Noor El Amrani', { photoRef: avatar('noor') }),
    person('demo-tim', 'Tim de Vries'),
    person('demo-femke', 'Femke Mulder'),
    person('demo-anouk', 'Anouk Jansen', {
      photoRef: avatar('anouk'),
      contactPoints: [contact('demo-anouk', 'email', 'anouk@example.com', 'Werk')],
    }),
    person('demo-pieter', 'Pieter Hendriks'),
  ],
  // Linked to the browser's simulated Google account, so write-back can be tried.
  externalIdentities: ['sophie', 'els', 'robin', 'daan', 'sanne', 'anouk'].map((name) => ({
    id: `identity-${name}`,
    personId: `demo-${name}`,
    provider: 'google' as const,
    providerAccountId: 'preview-account',
    providerResourceId: `people/preview-${name}`,
    lastSyncedAt: now - DAY,
  })),
  circles: [
    {
      id: 'circle-family',
      name: 'Familie',
      colorToken: 'family',
      iconKey: 'home',
      backgroundImageRef: `${import.meta.env.BASE_URL}circle-backgrounds/family.svg`,
      isFavorite: true,
      isArchived: false,
    },
    {
      id: 'circle-friends',
      name: 'Vrienden',
      colorToken: 'primary',
      iconKey: 'heart',
      isFavorite: true,
      isArchived: false,
    },
    {
      id: 'circle-football',
      name: 'Voetbal',
      description: 'Zaterdag 3 · VV De Zwaluwen',
      colorToken: 'team',
      iconKey: 'trophy',
      backgroundImageRef: `${import.meta.env.BASE_URL}circle-backgrounds/football.svg`,
      isFavorite: true,
      isArchived: false,
    },
    {
      id: 'circle-work',
      name: 'Werk',
      colorToken: 'work',
      iconKey: 'briefcase',
      isFavorite: false,
      isArchived: false,
    },
  ],
  memberships: [
    ...['demo-richard', 'demo-sophie', 'demo-emma', 'demo-lucas', 'demo-henk', 'demo-els'].map(
      (personId) => ({ circleId: 'circle-family', personId }),
    ),
    ...['demo-richard', 'demo-robin', 'demo-daan', 'demo-sanne'].map((personId) => ({
      circleId: 'circle-friends',
      personId,
    })),
    ...[
      'demo-richard',
      'demo-robin',
      'demo-daan',
      'demo-sanne',
      'demo-mehmet',
      'demo-lotte',
      'demo-jeroen',
      'demo-noor',
      'demo-tim',
      'demo-femke',
    ].map((personId) => ({ circleId: 'circle-football', personId })),
    { circleId: 'circle-work', personId: 'demo-richard', role: 'Product' },
    { circleId: 'circle-work', personId: 'demo-anouk', role: 'Teamlead' },
    { circleId: 'circle-work', personId: 'demo-pieter' },
    { circleId: 'circle-work', personId: 'demo-mehmet' },
  ],
  relationships: [
    connection(
      'rel-richard-sophie',
      'demo-richard',
      'demo-sophie',
      'partner-of',
      'wife',
      'husband',
    ),
    connection('rel-richard-emma', 'demo-richard', 'demo-emma', 'parent-of', 'daughter', 'father'),
    connection('rel-richard-lucas', 'demo-richard', 'demo-lucas', 'parent-of', 'son', 'father'),
    connection('rel-sophie-emma', 'demo-sophie', 'demo-emma', 'parent-of', 'daughter', 'mother'),
    connection('rel-sophie-lucas', 'demo-sophie', 'demo-lucas', 'parent-of', 'son', 'mother'),
    connection('rel-henk-richard', 'demo-henk', 'demo-richard', 'parent-of', 'son', 'father'),
    connection('rel-els-richard', 'demo-els', 'demo-richard', 'parent-of', 'son', 'mother'),
    connection('rel-henk-els', 'demo-henk', 'demo-els', 'partner-of', 'wife', 'husband'),
    connection(
      'rel-richard-robin',
      'demo-richard',
      'demo-robin',
      'friend-of',
      'best-friend',
      'best-friend',
    ),
    connection('rel-richard-daan', 'demo-richard', 'demo-daan', 'friend-of', 'friend', 'friend'),
  ],
  notes: [
    {
      id: 'note-richard',
      body: 'Volgende maand met Robin gaan fietsen. Route langs de kust uitzoeken.',
      personIds: ['demo-richard', 'demo-robin'],
      occurredAt: now - DAY,
      isPinned: true,
      createdAt: now - DAY,
      updatedAt: now - DAY,
    },
    {
      id: 'note-emma',
      body: 'Wil graag een tekenset en is helemaal fan van paarden.',
      personIds: ['demo-emma'],
      occurredAt: now - 12 * DAY,
      isPinned: false,
      createdAt: now - 12 * DAY,
      updatedAt: now - 12 * DAY,
    },
  ],
  events: [
    {
      id: 'event-wedding',
      type: 'wedding-anniversary',
      title: 'Trouwdag',
      date: inDays(9, 2011),
      personIds: ['demo-richard', 'demo-sophie'],
      source: 'kindy',
    },
  ],
  reminders: [
    {
      id: 'reminder-emma-gift',
      personId: 'demo-emma',
      title: 'Taart ophalen voor Emma',
      localDateTime: '2026-01-01T16:00:00',
      timezone: 'Europe/Amsterdam',
      recurrence: { kind: 'once' },
      notificationOffsetsMinutes: [0],
      isCancelled: false,
    },
    {
      id: 'reminder-robin',
      personId: 'demo-robin',
      title: 'Robin bellen over de fietsroute',
      localDateTime: '2026-01-01T10:00:00',
      timezone: 'Europe/Amsterdam',
      recurrence: { kind: 'once' },
      notificationOffsetsMinutes: [0],
      isCancelled: false,
    },
    {
      id: 'reminder-els',
      personId: 'demo-els',
      title: 'Bloemen brengen bij mama',
      localDateTime: '2026-01-01T11:00:00',
      timezone: 'Europe/Amsterdam',
      recurrence: { kind: 'once' },
      notificationOffsetsMinutes: [0],
      isCancelled: false,
    },
  ],
  reminderOccurrences: [
    {
      id: 'occurrence-emma',
      reminderId: 'reminder-emma-gift',
      dueAt: at(0, 16),
      state: 'scheduled',
    },
    { id: 'occurrence-robin', reminderId: 'reminder-robin', dueAt: at(2, 10), state: 'scheduled' },
    { id: 'occurrence-els', reminderId: 'reminder-els', dueAt: at(-1, 11), state: 'scheduled' },
  ],
  interactions: [],
  syncQueue: [],
  wishes: [
    wish('wish-emma-drawing', 'demo-emma', 'Tekenset met aquarelpotloden', 'idea'),
    wish('wish-emma-horses', 'demo-emma', 'Boek over paarden', 'bought', 'Ligt al in de kast'),
    wish('wish-robin-bottle', 'demo-robin', 'Fietsbidon met isolatie', 'idea'),
    wish('wish-sophie-concert', 'demo-sophie', 'Kaartjes voor een concert', 'idea'),
  ],
  calendarLinks: [],
}
