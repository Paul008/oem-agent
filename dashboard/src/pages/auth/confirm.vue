<script setup lang="ts">
import Loading from '@/components/loading.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

watchEffect(() => {
  if (authStore.isLogin) {
    router.replace('/dashboard/')
  }
})

// If after 10 seconds we still don't have a session, redirect to sign-in
const timeout = setTimeout(() => {
  if (!authStore.isLogin) {
    router.replace('/auth/sign-in')
  }
}, 10000)

onUnmounted(() => clearTimeout(timeout))
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen gap-4">
    <Loading />
    <p class="text-sm text-muted-foreground">
      Confirming your sign in...
    </p>
  </div>
</template>

<route lang="yaml">
meta:
  layout: false
</route>
