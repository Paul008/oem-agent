import { supabase } from '@/lib/supabase'

import type { User } from './schema'

export async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase.auth.admin.listUsers()

  if (error) throw error

  return data.users.map((u) => {
    const meta = u.user_metadata ?? {}
    const emailName = u.email?.split('@')[0] ?? ''

    return {
      id: u.id,
      firstName: meta.first_name ?? emailName,
      lastName: meta.last_name ?? '',
      username: emailName,
      email: u.email ?? '',
      phoneNumber: u.phone ?? '',
      status: u.email_confirmed_at ? 'active' : 'invited',
      role: meta.role ?? 'admin',
      createdAt: new Date(u.created_at),
      updatedAt: new Date(u.updated_at ?? u.created_at),
    } satisfies User
  })
}

// Keep empty array as default for initial render
export const users: User[] = []
