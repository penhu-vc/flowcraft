import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
