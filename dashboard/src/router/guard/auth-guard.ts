import type { Router } from 'vue-router'

import pinia from '@/plugins/pinia/setup'
import { useAuthStore } from '@/stores/auth'

export function authGuard(router: Router) {
  router.beforeEach(async (to) => {
    const authStore = useAuthStore(pinia)

    // Ensure auth state is initialized before checking
    if (!authStore.initialized) {
      await authStore.init()
    }

    const isAuthRoute = to.path.startsWith('/auth')

    // Not logged in and trying to access protected route → redirect to sign-in
    if (!authStore.isLogin && !isAuthRoute) {
      return {
        path: '/auth/sign-in',
        query: { redirect: to.fullPath },
      }
    }

    // Already logged in and trying to access auth route → redirect to dashboard
    if (authStore.isLogin && isAuthRoute) {
      return { path: '/dashboard/' }
    }
  })
}
