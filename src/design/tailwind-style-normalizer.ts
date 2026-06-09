import type {
  NormalizedStyleDeclaration,
  TailwindRecipeArtifact,
  TailwindRecipeNode,
} from './tailwind-recipe-types';

const ALLOWED_PROPERTIES = new Set([
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'align-items', 'justify-content', 'justify-items', 'align-self', 'justify-self',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-align', 'text-transform', 'color',
  'background-color', 'background-image', 'background-size', 'background-position',
  'border', 'border-width', 'border-color', 'border-style', 'border-radius',
  'box-shadow', 'opacity', 'overflow', 'object-fit', 'object-position',
  'transform', 'visibility',
]);

function hasUsefulValue(property: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'normal' && property !== 'font-weight') return false;
  if (normalized === 'none' && property !== 'display') return false;
  if (property === 'background-color' && (normalized === 'rgba(0, 0, 0, 0)' || normalized === 'transparent')) return false;
  return true;
}

function visitNode(node: TailwindRecipeNode, declarations: NormalizedStyleDeclaration[]): void {
  for (const [property, value] of Object.entries(node.computed_style || {})) {
    const prop = property.trim().toLowerCase();
    const val = String(value ?? '').trim();
    if (ALLOWED_PROPERTIES.has(prop) && hasUsefulValue(prop, val)) {
      declarations.push({ node_path: node.path, property: prop, value: val });
    }
  }

  for (const child of node.children || []) visitNode(child, declarations);
}

export function normalizeRegionStyles(artifact: TailwindRecipeArtifact): NormalizedStyleDeclaration[] {
  const declarations: NormalizedStyleDeclaration[] = [];
  visitNode(artifact.root, declarations);
  return declarations;
}
