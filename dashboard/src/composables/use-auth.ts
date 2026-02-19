import { storeToRefs } from 'pinia'

import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export function useAuth() {
  const router = useRouter()

  const authStore = useAuthStore()
  const { isLogin, user } = storeToRefs(authStore)
  const loading = ref(false)

  async function sendMagicLink(email: string) {
    loading.value = true
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        shouldCreateUser: false,
      },
    })
    loading.value = false
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/auth/sign-in')
  }

  return {
    loading,
    isLogin,
    user,
    sendMagicLink,
    logout,
  }
}
