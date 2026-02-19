<script setup lang="ts">
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'

import { columns } from './components/columns'
import DataTable from './components/data-table.vue'
import UserInvite from './components/user-invite.vue'
import { fetchUsers } from './data/users'

import type { User } from './data/schema'

const users = ref<User[]>([])
const loading = ref(false)

async function loadUsers() {
  loading.value = true
  try {
    users.value = await fetchUsers()
  }
  catch (err: any) {
    toast.error(err.message || 'Failed to load users')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadUsers)
</script>

<template>
  <BasicPage
    title="Users"
    description="Manage team members and their access levels."
    sticky
  >
    <template #actions>
      <UserInvite @invited="loadUsers" />
    </template>
    <div class="overflow-x-auto">
      <DataTable :loading :data="users" :columns="columns" />
    </div>
  </BasicPage>
</template>
