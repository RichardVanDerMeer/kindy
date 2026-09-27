import { createRouter, createWebHistory } from 'vue-router'

import CirclesView from '@/views/CirclesView.vue'
import HomeView from '@/views/HomeView.vue'
import PeopleView from '@/views/PeopleView.vue'
import PersonView from '@/views/PersonView.vue'
import SettingsView from '@/views/SettingsView.vue'
import UpcomingView from '@/views/UpcomingView.vue'

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
      meta: { showNavigation: false },
    },
    { path: '/circles', name: 'circles', component: CirclesView },
    { path: '/upcoming', name: 'upcoming', component: UpcomingView },
    { path: '/search', redirect: '/' },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { showNavigation: false },
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
