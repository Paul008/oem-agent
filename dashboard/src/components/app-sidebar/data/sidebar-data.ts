import { Car } from 'lucide-vue-next'

import { useAuthStore } from '@/stores/auth'
import { useSidebar } from '@/composables/use-sidebar'

import type { SidebarData, Team } from '../types'

const teams: Team[] = [
  {
    name: 'OEM Intelligence',
    logo: Car,
    plan: 'Production',
  },
]

const { navData } = useSidebar()

export function useSidebarData(): SidebarData {
  const authStore = useAuthStore()

  return {
    user: {
      name: authStore.user?.email?.split('@')[0] ?? 'OEM Agent',
      email: authStore.user?.email,
      avatar: '/logo.png',
    },
    teams,
    navMain: navData.value!,
  }
}

// Keep static export for backward compatibility
export const sidebarData: SidebarData = {
  user: {
    name: 'OEM Agent',
    avatar: '/logo.png',
  },
  teams,
  navMain: navData.value!,
}
