import type { Component } from 'vue'

import {
  Columns3,
  Database,
  Grid3x3,
  Image,
  Layers,
  Megaphone,
  Play,
  SplitSquareHorizontal,
} from 'lucide-vue-next'

export type RecipePatternGroupKey
  = | 'hero'
    | 'card-grid'
    | 'split-content'
    | 'media'
    | 'tabs'
    | 'data-display'
    | 'action-bar'
    | 'utility'

export interface RecipePatternGroup {
  key: RecipePatternGroupKey
  label: string
  icon: Component
}

export const RECIPE_PATTERN_GROUPS: RecipePatternGroup[] = [
  { key: 'hero', label: 'Hero', icon: Image },
  { key: 'card-grid', label: 'Card Grid', icon: Grid3x3 },
  { key: 'split-content', label: 'Split Content', icon: SplitSquareHorizontal },
  { key: 'media', label: 'Media', icon: Play },
  { key: 'tabs', label: 'Tabs', icon: Columns3 },
  { key: 'data-display', label: 'Data Display', icon: Database },
  { key: 'action-bar', label: 'Action Bar', icon: Megaphone },
  { key: 'utility', label: 'Utility', icon: Layers },
]

export function getRecipePatternGroup(key: string): RecipePatternGroup | undefined {
  return RECIPE_PATTERN_GROUPS.find(group => group.key === key)
}
