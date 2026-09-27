import {
  Bike,
  BookOpen,
  BriefcaseBusiness,
  Camera,
  ChefHat,
  Church,
  Coffee,
  Dice5,
  Dog,
  Drama,
  Dumbbell,
  Flag,
  Footprints,
  Gamepad2,
  Goal,
  GraduationCap,
  Guitar,
  HandHeart,
  Heart,
  House,
  Medal,
  Mountain,
  Music,
  Palette,
  PartyPopper,
  Plane,
  Sailboat,
  Sparkles,
  Tent,
  Trophy,
  Users,
  UtensilsCrossed,
  Volleyball,
  Waves,
  Wine,
} from '@lucide/vue'
import type { Component } from 'vue'

import type { CircleColor } from '@/domain/model'

export const circleIcons: Record<string, Component> = {
  home: House,
  heart: Heart,
  users: Users,
  briefcase: BriefcaseBusiness,
  school: GraduationCap,
  neighbours: HandHeart,
  party: PartyPopper,
  sparkles: Sparkles,
  trophy: Trophy,
  goal: Goal,
  volleyball: Volleyball,
  medal: Medal,
  running: Footprints,
  bike: Bike,
  swimming: Waves,
  golf: Flag,
  fitness: Dumbbell,
  sailing: Sailboat,
  hiking: Mountain,
  camping: Tent,
  music: Music,
  guitar: Guitar,
  theater: Drama,
  art: Palette,
  photo: Camera,
  books: BookOpen,
  games: Dice5,
  gaming: Gamepad2,
  cooking: ChefHat,
  dinner: UtensilsCrossed,
  wine: Wine,
  coffee: Coffee,
  travel: Plane,
  dog: Dog,
  church: Church,
}

export function circleIcon(iconKey: string): Component {
  return circleIcons[iconKey] ?? Users
}

export const circleColors: CircleColor[] = ['family', 'team', 'work', 'primary', 'note', 'neutral']

export interface CirclePreset {
  id: string
  group: 'general' | 'sport'
  icon: string
  color: CircleColor
}

/** Ready-made backgrounds for common circles; picking one also suggests an icon and colour. */
export const circlePresets: CirclePreset[] = [
  { id: 'family', group: 'general', icon: 'home', color: 'family' },
  { id: 'friends', group: 'general', icon: 'heart', color: 'primary' },
  { id: 'work', group: 'general', icon: 'briefcase', color: 'work' },
  { id: 'neighbours', group: 'general', icon: 'neighbours', color: 'team' },
  { id: 'school', group: 'general', icon: 'school', color: 'work' },
  { id: 'travel', group: 'general', icon: 'travel', color: 'work' },
  { id: 'music', group: 'general', icon: 'music', color: 'family' },
  { id: 'games', group: 'general', icon: 'games', color: 'note' },
  { id: 'football', group: 'sport', icon: 'goal', color: 'team' },
  { id: 'tennis', group: 'sport', icon: 'trophy', color: 'work' },
  { id: 'padel', group: 'sport', icon: 'trophy', color: 'work' },
  { id: 'basketball', group: 'sport', icon: 'medal', color: 'family' },
  { id: 'hockey', group: 'sport', icon: 'trophy', color: 'work' },
  { id: 'volleyball', group: 'sport', icon: 'volleyball', color: 'note' },
  { id: 'running', group: 'sport', icon: 'running', color: 'family' },
  { id: 'cycling', group: 'sport', icon: 'bike', color: 'team' },
  { id: 'swimming', group: 'sport', icon: 'swimming', color: 'work' },
  { id: 'golf', group: 'sport', icon: 'golf', color: 'team' },
  { id: 'fitness', group: 'sport', icon: 'fitness', color: 'primary' },
  { id: 'sailing', group: 'sport', icon: 'sailing', color: 'work' },
]

export function presetBackground(presetId: string): string {
  return `${import.meta.env.BASE_URL}circle-backgrounds/${presetId}.svg`
}
