import { createRouter, createWebHistory } from 'vue-router'

import CirclesView from '@/views/CirclesView.vue'
import PeopleView from '@/views/PeopleView.vue'
import PersonView from '@/views/PersonView.vue'
import SearchView from '@/views/SearchView.vue'
import UpcomingView from '@/views/UpcomingView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'people', component: PeopleView },
    {
      path: '/people/:id',
      name: 'person',
      component: PersonView,
      props: true,
      meta: { showNavigation: false },
    },
    { path: '/circles', name: 'circles', component: CirclesView },
    { path: '/upcoming', name: 'upcoming', component: UpcomingView },
    { path: '/search', name: 'search', component: SearchView },
  ],
})

export default router
