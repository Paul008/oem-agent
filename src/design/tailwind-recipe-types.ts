export interface TailwindRecipeViewport {
  name: 'desktop' | 'tablet' | 'mobile' | string;
  width: number;
  height: number;
}

export interface TailwindRecipeNode {
  path: string;
  tag: string;
  text: string;
  attributes: Record<string, string>;
  computed_style: Record<string, string>;
  children: TailwindRecipeNode[];
}

export interface TailwindRecipeArtifact {
  oem_id: string;
  model_slug: string;
  source_url: string;
  region_id: string;
  viewport: TailwindRecipeViewport;
  root: TailwindRecipeNode;
}

export interface NormalizedStyleDeclaration {
  node_path: string;
  property: string;
  value: string;
}

export interface TailwindDeclarationMapping {
  node_path: string;
  property: string;
  value: string;
  classes: string[];
  confidence: number;
  unmapped: boolean;
}

export interface TailwindRecipeCompileResult {
  section_type: string;
  section: Record<string, any>;
  confidence: number;
  mappings: TailwindDeclarationMapping[];
  diagnostics: string[];
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNode(value: unknown): value is TailwindRecipeNode {
  if (!isRecord(value)) return false;
  return typeof value.path === 'string'
    && typeof value.tag === 'string'
    && typeof value.text === 'string'
    && isRecord(value.attributes)
    && isRecord(value.computed_style)
    && Array.isArray(value.children);
}

export function isTailwindRecipeArtifact(value: unknown): value is TailwindRecipeArtifact {
  if (!isRecord(value)) return false;
  if (!isRecord(value.viewport)) return false;
  return typeof value.oem_id === 'string'
    && typeof value.model_slug === 'string'
    && typeof value.source_url === 'string'
    && typeof value.region_id === 'string'
    && typeof value.viewport.name === 'string'
    && typeof value.viewport.width === 'number'
    && typeof value.viewport.height === 'number'
    && isNode(value.root);
}
