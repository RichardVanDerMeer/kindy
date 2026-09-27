import { Capacitor, registerPlugin, type PermissionState } from '@capacitor/core'

import type { DeviceCalendarEvent } from '@/domain/calendar'
import type {
  CalendarPermission,
  DeviceCalendar,
  DeviceCalendarGateway,
  NewCalendarEvent,
} from '@/domain/ports'

interface CalendarPlugin {
  checkPermissions(): Promise<{ calendar: PermissionState }>
  requestPermissions(): Promise<{ calendar: PermissionState }>
  listCalendars(): Promise<{ calendars: DeviceCalendar[] }>
  listEvents(options: { from: number; to: number }): Promise<{ events: DeviceCalendarEvent[] }>
  createEvent(options: NewCalendarEvent): Promise<{ id: string }>
}

const nativePlugin = registerPlugin<CalendarPlugin>('KindyCalendar')

function toPermission(state: PermissionState): CalendarPermission {
  if (state === 'granted') return 'granted'
  if (state === 'denied') return 'denied'
  return 'prompt'
}

class NativeDeviceCalendarGateway implements DeviceCalendarGateway {
  async permission(): Promise<CalendarPermission> {
    return toPermission((await nativePlugin.checkPermissions()).calendar)
  }

  async requestPermission(): Promise<CalendarPermission> {
    return toPermission((await nativePlugin.requestPermissions()).calendar)
  }

  async listCalendars(): Promise<DeviceCalendar[]> {
    return (await nativePlugin.listCalendars()).calendars
  }

  async listEvents(from: number, to: number): Promise<DeviceCalendarEvent[]> {
    return (await nativePlugin.listEvents({ from, to })).events
  }

  async createEvent(input: NewCalendarEvent): Promise<{ id: string }> {
    return nativePlugin.createEvent(input)
  }
}

const PREVIEW_PERMISSION_KEY = 'kindy.preview-calendar-permission'
const PREVIEW_EVENTS_KEY = 'kindy.preview-calendar-events'
const HOUR = 3_600_000

function at(dayOffset: number, hour: number, minute = 0): number {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, minute, 0, 0)
  return date.getTime()
}

/** A plausible week of appointments, relative to today. */
function previewSeed(): DeviceCalendarEvent[] {
  const event = (
    id: string,
    title: string,
    startsAt: number,
    extra: Partial<DeviceCalendarEvent> = {},
  ): DeviceCalendarEvent => ({
    id,
    calendarId: 'preview-personal',
    calendarName: 'Persoonlijk',
    title,
    startsAt,
    endsAt: startsAt + 2 * HOUR,
    allDay: false,
    attendeeEmails: [],
    ...extra,
  })
  return [
    event('preview-dinner', 'Uit eten', at(3, 19), {
      location: 'De Zwaan, Utrecht',
      attendeeEmails: ['robin@example.com'],
    }),
    event('preview-party', 'Verjaardagsfeestje Emma', at(0, 15)),
    event('preview-padel', 'Padel met Daan', at(5, 20, 30), { endsAt: at(5, 22) }),
    event('preview-dentist', 'Tandarts', at(2, 9), { endsAt: at(2, 9, 30) }),
    event('preview-coffee', 'Koffie met Sanne de Jong', at(-2, 10, 30), {
      endsAt: at(-2, 11, 30),
    }),
  ]
}

/** Browser stand-in for the phone's calendar, kept in local storage. */
class PreviewDeviceCalendarGateway implements DeviceCalendarGateway {
  async permission(): Promise<CalendarPermission> {
    return this.read(PREVIEW_PERMISSION_KEY) === 'granted' ? 'granted' : 'prompt'
  }

  async requestPermission(): Promise<CalendarPermission> {
    this.write(PREVIEW_PERMISSION_KEY, 'granted')
    return 'granted'
  }

  async listCalendars(): Promise<DeviceCalendar[]> {
    return [
      { id: 'preview-personal', name: 'Persoonlijk', accountName: 'Google', isPrimary: true },
      { id: 'preview-family', name: 'Gezin', accountName: 'Google', isPrimary: false },
    ]
  }

  async listEvents(from: number, to: number): Promise<DeviceCalendarEvent[]> {
    return this.events().filter((event) => event.startsAt >= from && event.startsAt <= to)
  }

  async createEvent(input: NewCalendarEvent): Promise<{ id: string }> {
    const id = `preview-${crypto.randomUUID()}`
    const events = this.events()
    events.push({
      id,
      calendarId: input.calendarId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      location: input.location,
      attendeeEmails: [],
    })
    this.write(PREVIEW_EVENTS_KEY, JSON.stringify(events))
    return { id }
  }

  private events(): DeviceCalendarEvent[] {
    const stored = this.read(PREVIEW_EVENTS_KEY)
    if (stored) return JSON.parse(stored) as DeviceCalendarEvent[]
    const seed = previewSeed()
    this.write(PREVIEW_EVENTS_KEY, JSON.stringify(seed))
    return seed
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      // The preview calendar is best effort only.
    }
  }
}

let gateway: DeviceCalendarGateway | undefined

export function getDeviceCalendarGateway(): DeviceCalendarGateway {
  gateway ??= Capacitor.isNativePlatform()
    ? new NativeDeviceCalendarGateway()
    : new PreviewDeviceCalendarGateway()
  return gateway
}
