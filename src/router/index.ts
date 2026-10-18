import { createRouter, createWebHistory } from 'vue-router'

import CirclesView from '@/views/CirclesView.vue'
import CircleView from '@/views/CircleView.vue'
import HomeView from '@/views/HomeView.vue'
import PeopleView from '@/views/PeopleView.vue'
import PersonView from '@/views/PersonView.vue'
import SettingsView from '@/views/SettingsView.vue'
import UpcomingView from '@/views/UpcomingView.vue'

/** The navigation bar is always shown, so Home is one tap away from any screen. */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/people', name: 'people', component: PeopleView },
    {
      path: '/people/:id',
      name: 'person',
      component: PersonView,
      props: true,
    },
    { path: '/circles', name: 'circles', component: CirclesView },
    {
      path: '/circles/:id',
      name: 'circle',
      component: CircleView,
      props: true,
    },
    { path: '/upcoming', name: 'upcoming', component: UpcomingView },
    { path: '/search', redirect: '/' },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
  ],
  // A hash such as #wishlist scrolls to that part of a profile.
  scrollBehavior: (to) => (to.hash ? { el: to.hash, top: 16 } : { top: 0 }),
})

export default router
