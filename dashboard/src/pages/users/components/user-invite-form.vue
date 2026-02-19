<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { Send } from 'lucide-vue-next'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'

import Button from '@/components/ui/button/Button.vue'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'

import type { UserInviteValidator } from '../validators/user-invite.validator'

import { userInviteValidator } from '../validators/user-invite.validator'

const emit = defineEmits<{
  success: []
}>()

const roles = ['superadmin', 'admin', 'cashier', 'manager'] as const

const initialValues = reactive<UserInviteValidator>({
  email: '',
  role: 'admin',
  description: '',
})
const userInviteFormSchema = toTypedSchema(userInviteValidator)
const { handleSubmit, resetForm } = useForm({
  validationSchema: userInviteFormSchema,
  initialValues,
})

const loading = ref(false)

const onSubmit = handleSubmit(async (values) => {
  loading.value = true
  try {
    const { error } = await supabase.auth.admin.inviteUserByEmail(values.email, {
      data: { role: values.role, description: values.description },
      redirectTo: `${window.location.origin}/auth/confirm`,
    })

    if (error) throw error

    toast.success(`Invitation sent to ${values.email}`)
    resetForm()
    emit('success')
  }
  catch (err: any) {
    toast.error(err.message || 'Failed to send invitation')
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <form class="space-y-8" @submit="onSubmit">
    <FormField v-slot="{ componentField }" name="email">
      <FormItem>
        <FormLabel>Email address</FormLabel>
        <FormControl>
          <Input type="email" placeholder="user@example.com" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="role">
      <FormItem>
        <FormLabel>
          Role
          <span class="text-destructive"> *</span>
        </FormLabel>
        <FormControl>
          <Select v-bind="componentField">
            <FormControl>
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="role in roles" :key="role" :value="role">
                  {{ role }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="description">
      <FormItem>
        <FormLabel>Description (Optional)</FormLabel>
        <FormControl>
          <Textarea v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <Button type="submit" class="w-full" :disabled="loading">
      <UiSpinner v-if="loading" class="mr-2" />
      <template v-else>
        Invite
        <Send />
      </template>
    </Button>
  </form>
</template>
