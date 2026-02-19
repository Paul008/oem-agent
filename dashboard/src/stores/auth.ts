import type { User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'

import { supabase } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const isLogin = computed(() => !!user.value)
  const initialized = ref(false)

  async function init() {
    if (initialized.value) return

    const { data } = await supabase.auth.getSession()
    user.value = data.session?.user ?? null

    supabase.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null
    })

    initialized.value = true
  }

  return {
    user,
    isLogin,
    initialized,
    init,
  }
})
