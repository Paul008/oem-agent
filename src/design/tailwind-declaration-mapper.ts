import type {
  NormalizedStyleDeclaration,
  TailwindDeclarationMapping,
} from './tailwind-recipe-types';

const DISPLAY: Record<string, string> = {
  block: 'block',
  'inline-block': 'inline-block',
  flex: 'flex',
  'inline-flex': 'inline-flex',
  grid: 'grid',
  none: 'hidden',
};

const TEXT_ALIGN: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
};

const FONT_WEIGHT: Record<string, string> = {
  '400': 'font-normal',
  normal: 'font-normal',
  '500': 'font-medium',
  '600': 'font-semibold',
  '700': 'font-bold',
  bold: 'font-bold',
  '800': 'font-extrabold',
  '900': 'font-black',
};

function rgbToHex(value: string): string | null {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

function arbitrary(prefix: string, value: string): string {
  return `${prefix}-[${value.replace(/\s+/g, '_')}]`;
}

function mapDeclaration(property: string, value: string): string[] {
  const normalized = value.trim().toLowerCase();

  if (property === 'display' && DISPLAY[normalized]) return [DISPLAY[normalized]];
  if (property === 'text-align' && TEXT_ALIGN[normalized]) return [TEXT_ALIGN[normalized]];
  if (property === 'font-weight' && FONT_WEIGHT[normalized]) return [FONT_WEIGHT[normalized]];
  if (property === 'font-size') return [arbitrary('text', value)];
  if (property === 'line-height') return [arbitrary('leading', value)];
  if (property === 'letter-spacing') return [arbitrary('tracking', value)];
  if (property === 'color') return [`text-[${rgbToHex(value) || value}]`];
  if (property === 'background-color') return [`bg-[${rgbToHex(value) || value}]`];
  if (property === 'border-radius') return [arbitrary('rounded', value)];
  if (property === 'gap') return [arbitrary('gap', value)];
  if (property.startsWith('padding')) return [arbitrary(property === 'padding' ? 'p' : `p-${property.split('-')[1]?.[0]}`, value)];
  if (property.startsWith('margin')) return [arbitrary(property === 'margin' ? 'm' : `m-${property.split('-')[1]?.[0]}`, value)];
  if (property === 'width') return [arbitrary('w', value)];
  if (property === 'height') return [arbitrary('h', value)];
  if (property === 'max-width') return [arbitrary('max-w', value)];
  if (property === 'min-height') return [arbitrary('min-h', value)];
  if (property === 'grid-template-columns') return [arbitrary('grid-cols', value)];
  if (property === 'object-fit') return normalized === 'cover' ? ['object-cover'] : normalized === 'contain' ? ['object-contain'] : [];
  return [];
}

export function mapDeclarationsToTailwind(declarations: NormalizedStyleDeclaration[]): TailwindDeclarationMapping[] {
  return declarations.map((declaration) => {
    const classes = mapDeclaration(declaration.property, declaration.value);
    return {
      ...declaration,
      classes,
      confidence: classes.length ? 0.8 : 0,
      unmapped: classes.length === 0,
    };
  });
}
