<script lang="ts" setup>
import { toast } from 'vue-sonner'

import { useAuth } from '@/composables/use-auth'

const { sendMagicLink, loading } = useAuth()

const email = ref('')
const sent = ref(false)

async function handleSubmit() {
  if (!email.value) return

  try {
    await sendMagicLink(email.value)
    sent.value = true
    toast.success('Magic link sent! Check your email.')
  }
  catch (err: any) {
    toast.error(err.message || 'Failed to send magic link')
  }
}
</script>

<template>
  <UiCard class="w-full max-w-sm">
    <UiCardHeader>
      <UiCardTitle class="text-2xl">
        Sign In
      </UiCardTitle>
      <UiCardDescription>
        Enter your email to receive a magic link.
      </UiCardDescription>
    </UiCardHeader>
    <UiCardContent class="grid gap-4">
      <template v-if="!sent">
        <form class="grid gap-4" @submit.prevent="handleSubmit">
          <div class="grid gap-2">
            <UiLabel for="email">
              Email
            </UiLabel>
            <UiInput
              id="email"
              v-model="email"
              type="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <UiButton type="submit" class="w-full" :disabled="loading">
            <UiSpinner v-if="loading" class="mr-2" />
            Send Magic Link
          </UiButton>
        </form>
      </template>

      <template v-else>
        <div class="text-center space-y-3">
          <p class="text-sm text-muted-foreground">
            We sent a magic link to <strong>{{ email }}</strong>.
            Check your inbox and click the link to sign in.
          </p>
          <UiButton variant="outline" class="w-full" @click="sent = false">
            Try a different email
          </UiButton>
        </div>
      </template>
    </UiCardContent>
  </UiCard>
</template>
