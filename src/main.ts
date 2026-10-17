import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { vAsyncClick } from './directives/asyncClick'
import { i18n } from './locales'
import router from './router'
import './styles/tokens.css'
import './styles/global.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)
app.directive('async-click', vAsyncClick)

document.documentElement.lang = i18n.global.locale.value

app.mount('#app')
