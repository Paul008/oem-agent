import { Activity, BookOpen, Bot, Car, Clock, Cpu, Factory, FileText, Gauge, Globe, Image, KeyRound, Layers, List, Palette, Play, Shield, Tag, TrendingUp, Users, Wrench, Calendar, Settings } from 'lucide-vue-next'

import type { NavGroup } from '@/components/app-sidebar/types'

export function useSidebar() {
  const navData = ref<NavGroup[]>([
    {
      title: 'OEM Intelligence',
      items: [
        { title: 'Overview', url: '/dashboard', icon: Gauge },
        { title: 'Import Runs', url: '/dashboard/runs', icon: Clock },
        { title: 'Change Feed', url: '/dashboard/changes', icon: Activity },
        { title: 'Operations', url: '/dashboard/operations', icon: Play },
        { title: 'AI Agents', url: '/dashboard/agents/', icon: Bot },
        { title: 'Cron Jobs', url: '/dashboard/cron', icon: Calendar },
      ],
    },
    {
      title: 'Catalog',
      items: [
        { title: 'OEMs', url: '/dashboard/oems', icon: Factory },
        { title: 'Models & Variants', url: '/dashboard/products', icon: Car },
        { title: 'Variants Browser', url: '/dashboard/variants', icon: List },
        { title: 'Offers', url: '/dashboard/offers', icon: Tag },
        { title: 'Banners', url: '/dashboard/banners', icon: Image },
        { title: 'Accessories', url: '/dashboard/accessories', icon: Wrench },
        { title: 'Colors', url: '/dashboard/colors', icon: Palette },
        { title: 'Pricing', url: '/dashboard/pricing', icon: TrendingUp },
        { title: 'Model Pages', url: '/dashboard/model-pages', icon: FileText },
      ],
    },
    {
      title: 'Infrastructure',
      items: [
        { title: 'Agent Architecture', url: '/dashboard/agent-infra', icon: Layers },
        { title: 'Source Pages', url: '/dashboard/source-pages', icon: Shield },
        { title: 'Discovered APIs', url: '/dashboard/apis', icon: Globe },
        { title: 'OEM Portals', url: '/dashboard/portals', icon: KeyRound },
        { title: 'API Docs', url: '/dashboard/docs', icon: BookOpen },
        { title: 'Page Builder', url: '/dashboard/page-builder-docs', icon: Cpu },
        { title: 'Regeneration Settings', url: '/dashboard/settings/regeneration', icon: Settings },
      ],
    },
    {
      title: 'Admin',
      items: [
        { title: 'Users', url: '/users', icon: Users },
      ],
    },
  ])

  const otherPages = ref<NavGroup[]>([])
  const settingsNavItems: never[] = []

  return {
    navData,
    otherPages,
    settingsNavItems,
  }
}
