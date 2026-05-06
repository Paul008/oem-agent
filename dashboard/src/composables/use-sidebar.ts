import { Activity, BarChart3, BookmarkPlus, BookOpen, Bot, Brain, BrainCircuit, Calendar, Car, Clapperboard, Clock, Cpu, Eye, Factory, FileText, Gauge, Globe, HeartPulse, Image, Images, KeyRound, Layers, LayoutTemplate, List, Palette, Play, Plug, Rocket, ScrollText, Settings, Shield, Sparkles, Tag, TrendingUp, Users, Wrench } from 'lucide-vue-next'

import type { NavGroup } from '@/components/app-sidebar/types'

export function useSidebar() {
  const navData = ref<NavGroup[]>([
    {
      title: 'OEM Intelligence',
      items: [
        { title: 'Overview', url: '/dashboard', icon: Gauge },
        { title: 'Stock Health', url: '/dashboard/stock-health', icon: HeartPulse },
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
        { title: 'Specifications', url: '/dashboard/specs', icon: FileText },
        { title: 'PDFs & Specs', url: '/dashboard/pdfs', icon: ScrollText },
        { title: 'PDF Extracted Specs', url: '/dashboard/pdf-specs', icon: ScrollText },
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
        { title: 'Portal Assets', url: '/dashboard/portal-assets', icon: Images },
        { title: 'Media Library', url: '/dashboard/media', icon: Clapperboard },
        { title: 'Dealer API', url: '/dashboard/dealer-api', icon: Plug },
        { title: 'API Docs', url: '/dashboard/docs', icon: BookOpen },
        { title: 'Page Builder', url: '/dashboard/page-builder-docs', icon: Cpu },
        { title: 'Template Gallery', url: '/dashboard/page-builder/', icon: Sparkles },
        { title: 'Recipes', url: '/dashboard/recipes', icon: BookmarkPlus },
        { title: 'Style Guide', url: '/dashboard/style-guide', icon: Palette },
        { title: 'Recipe Analytics', url: '/dashboard/recipe-analytics', icon: BarChart3 },
        { title: 'Page Templates', url: '/dashboard/page-templates', icon: LayoutTemplate },
        { title: 'Recipe Showcase', url: '/dashboard/recipe-showcase', icon: Eye },
        { title: 'Design Health', url: '/dashboard/design-health', icon: HeartPulse },
        { title: 'Design Memory', url: '/dashboard/design-memory', icon: Brain },
        { title: 'Regeneration Settings', url: '/dashboard/settings/regeneration', icon: Settings },
        { title: 'AI Models', url: '/dashboard/settings/ai-models', icon: BrainCircuit },
        { title: 'Webhooks', url: '/dashboard/settings/webhooks', icon: Plug },
        { title: 'Onboard OEM', url: '/dashboard/onboarding', icon: Rocket },
        { title: 'Onboarding Docs', url: '/dashboard/onboarding-docs', icon: FileText },
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
