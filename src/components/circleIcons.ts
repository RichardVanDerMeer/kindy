import {
  Bike,
  BriefcaseBusiness,
  Coffee,
  GraduationCap,
  Heart,
  Home,
  Music,
  PartyPopper,
  Plane,
  Sparkles,
  Trophy,
  Users,
} from '@lucide/vue'
import type { Component } from 'vue'

import type { CircleColor } from '@/domain/model'

export const circleIcons: Record<string, Component> = {
  home: Home,
  heart: Heart,
  users: Users,
  trophy: Trophy,
  briefcase: BriefcaseBusiness,
  school: GraduationCap,
  music: Music,
  bike: Bike,
  coffee: Coffee,
  travel: Plane,
  party: PartyPopper,
  sparkles: Sparkles,
}

export function circleIcon(iconKey: string): Component {
  return circleIcons[iconKey] ?? Users
}

export const circleColors: CircleColor[] = ['family', 'team', 'work', 'primary', 'note', 'neutral']
