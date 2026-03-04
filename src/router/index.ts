import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/dashboard',
      component: () => import('../views/Dashboard.vue'),
    },
    {
      path: '/editor/:id',
      component: () => import('../views/Editor.vue'),
    },
    {
      path: '/editor/new',
      component: () => import('../views/Editor.vue'),
    },
    {
      path: '/monitor',
      component: () => import('../views/Monitor.vue'),
    },
    {
      path: '/nodes',
      component: () => import('../views/NodeCatalog.vue'),
    },
    {
      path: '/collections',
      component: () => import('../views/Collections.vue'),
    },
    {
      path: '/settings',
      component: () => import('../views/Settings.vue'),
    },
  ],
})

export default router
