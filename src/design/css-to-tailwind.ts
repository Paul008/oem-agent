/**
 * CSS-to-Tailwind Converter — Deterministic property mapping
 *
 * Converts computed CSS property/value pairs to Tailwind utility classes.
 * No AI, pure lookup table. Inspired by DivMagic, Windy, and Transform.tools.
 *
 * Used in the capture injection to convert inline styles to Tailwind classes
 * on-the-fly in the browser. This file defines the mapping tables — the actual
 * conversion runs client-side in the capture injection script.
 */

// ============================================================================
// Spacing scale: px → Tailwind spacing value
// ============================================================================

export function pxToSpacing(px: number): string {
  const map: Record<number, string> = {
    0: '0', 1: 'px', 2: '0.5', 4: '1', 6: '1.5', 8: '2', 10: '2.5',
    12: '3', 14: '3.5', 16: '4', 20: '5', 24: '6', 28: '7', 32: '8',
    36: '9', 40: '10', 44: '11', 48: '12', 56: '14', 64: '16',
    72: '18', 80: '20', 96: '24', 112: '28', 128: '32', 144: '36',
    160: '40', 176: '44', 192: '48', 208: '52', 224: '56', 240: '60',
    256: '64', 288: '72', 320: '80', 384: '96',
  }
  if (map[px] !== undefined) return map[px]
  // Find closest
  const keys = Object.keys(map).map(Number).sort((a, b) => a - b)
  const closest = keys.reduce((prev, curr) => Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev)
  if (Math.abs(closest - px) <= 2) return map[closest]
  // Use arbitrary value
  return `[${px}px]`
}

// ============================================================================
// Font size: px → Tailwind text-* class
// ============================================================================

export function fontSizeToTw(px: number): string {
  const map: Record<number, string> = {
    12: 'xs', 14: 'sm', 16: 'base', 18: 'lg', 20: 'xl',
    24: '2xl', 30: '3xl', 36: '4xl', 48: '5xl', 60: '6xl',
    72: '7xl', 96: '8xl', 128: '9xl',
  }
  if (map[px]) return map[px]
  const keys = Object.keys(map).map(Number).sort((a, b) => a - b)
  const closest = keys.reduce((prev, curr) => Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev)
  if (Math.abs(closest - px) <= 1) return map[closest]
  return `[${px}px]`
}

// ============================================================================
// Color: rgb/rgba → Tailwind color or arbitrary hex
// ============================================================================

export function colorToTw(rgb: string): string {
  // Common colors
  const colorMap: Record<string, string> = {
    'rgb(0, 0, 0)': 'black',
    'rgb(255, 255, 255)': 'white',
    'rgba(0, 0, 0, 0)': 'transparent',
    'rgb(239, 68, 68)': 'red-500',
    'rgb(59, 130, 246)': 'blue-500',
    'rgb(34, 197, 94)': 'green-500',
    'rgb(249, 115, 22)': 'orange-500',
    'rgb(168, 85, 247)': 'purple-500',
    'rgb(107, 114, 128)': 'gray-500',
    'rgb(156, 163, 175)': 'gray-400',
    'rgb(75, 85, 99)': 'gray-600',
    'rgb(55, 65, 81)': 'gray-700',
    'rgb(31, 41, 55)': 'gray-800',
    'rgb(17, 24, 39)': 'gray-900',
    'rgb(243, 244, 246)': 'gray-100',
    'rgb(229, 231, 235)': 'gray-200',
    'rgb(209, 213, 219)': 'gray-300',
    'rgb(249, 250, 251)': 'gray-50',
  }
  if (colorMap[rgb]) return colorMap[rgb]

  // Convert rgb to hex for arbitrary value
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (match) {
    const hex = '#' + [match[1], match[2], match[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('')
    return `[${hex}]`
  }

  // rgba with opacity
  const rgbaMatch = rgb.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
  if (rgbaMatch) {
    if (parseFloat(rgbaMatch[4]) === 0) return 'transparent'
    const hex = '#' + [rgbaMatch[1], rgbaMatch[2], rgbaMatch[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('')
    return `[${hex}]`
  }

  return `[${rgb}]`
}

// ============================================================================
// Border radius: px → Tailwind rounded-* class
// ============================================================================

export function borderRadiusToTw(px: number): string {
  const map: Record<number, string> = {
    0: 'none', 2: 'sm', 4: '', 6: 'md', 8: 'lg', 12: 'xl', 16: '2xl', 24: '3xl',
  }
  if (map[px] !== undefined) return map[px] || 'DEFAULT'
  if (px >= 9999) return 'full'
  return `[${px}px]`
}

// ============================================================================
// Main converter: CSS property + value → Tailwind class(es)
// ============================================================================

export function cssPropertyToTailwind(prop: string, value: string): string[] {
  if (!value || value === 'none' || value === 'normal' || value === 'auto') return []

  const classes: string[] = []
  const px = parseFloat(value)

  switch (prop) {
    // Display
    case 'display':
      const displayMap: Record<string, string> = {
        'block': 'block', 'inline-block': 'inline-block', 'inline': 'inline',
        'flex': 'flex', 'inline-flex': 'inline-flex',
        'grid': 'grid', 'inline-grid': 'inline-grid',
        'none': 'hidden', 'table': 'table',
      }
      if (displayMap[value]) classes.push(displayMap[value])
      break

    // Flex
    case 'flex-direction':
      if (value === 'column') classes.push('flex-col')
      else if (value === 'column-reverse') classes.push('flex-col-reverse')
      else if (value === 'row-reverse') classes.push('flex-row-reverse')
      break
    case 'flex-wrap':
      if (value === 'wrap') classes.push('flex-wrap')
      else if (value === 'wrap-reverse') classes.push('flex-wrap-reverse')
      break
    case 'align-items':
      const aiMap: Record<string, string> = {
        'flex-start': 'items-start', 'flex-end': 'items-end',
        'center': 'items-center', 'baseline': 'items-baseline', 'stretch': 'items-stretch',
      }
      if (aiMap[value]) classes.push(aiMap[value])
      break
    case 'justify-content':
      const jcMap: Record<string, string> = {
        'flex-start': 'justify-start', 'flex-end': 'justify-end',
        'center': 'justify-center', 'space-between': 'justify-between',
        'space-around': 'justify-around', 'space-evenly': 'justify-evenly',
      }
      if (jcMap[value]) classes.push(jcMap[value])
      break

    // Grid
    case 'grid-template-columns': {
      const colMatch = value.match(/repeat\((\d+),/i)
      if (colMatch) classes.push(`grid-cols-${colMatch[1]}`)
      else {
        const frCount = (value.match(/\d+fr/g) || []).length
        if (frCount > 0) classes.push(`grid-cols-${frCount}`)
      }
      break
    }
    case 'grid-template-rows': {
      const rowMatch = value.match(/repeat\((\d+),/i)
      if (rowMatch) classes.push(`grid-rows-${rowMatch[1]}`)
      break
    }

    // Gap
    case 'gap':
    case 'grid-gap':
      if (!isNaN(px)) classes.push(`gap-${pxToSpacing(px)}`)
      break
    case 'row-gap':
      if (!isNaN(px)) classes.push(`gap-y-${pxToSpacing(px)}`)
      break
    case 'column-gap':
      if (!isNaN(px)) classes.push(`gap-x-${pxToSpacing(px)}`)
      break

    // Sizing
    case 'width':
      if (value === '100%') classes.push('w-full')
      else if (!isNaN(px)) classes.push(`w-${pxToSpacing(px)}`)
      break
    case 'max-width':
      if (value === '100%') classes.push('max-w-full')
      else if (!isNaN(px)) classes.push(`max-w-[${px}px]`)
      break
    case 'min-height':
      if (!isNaN(px)) classes.push(`min-h-[${px}px]`)
      break
    case 'height':
      if (value === '100%') classes.push('h-full')
      else if (value === 'auto') break
      break

    // Padding
    case 'padding':
      if (!isNaN(px) && px > 0) classes.push(`p-${pxToSpacing(px)}`)
      break
    case 'padding-top':
      if (!isNaN(px) && px > 0) classes.push(`pt-${pxToSpacing(px)}`)
      break
    case 'padding-right':
      if (!isNaN(px) && px > 0) classes.push(`pr-${pxToSpacing(px)}`)
      break
    case 'padding-bottom':
      if (!isNaN(px) && px > 0) classes.push(`pb-${pxToSpacing(px)}`)
      break
    case 'padding-left':
      if (!isNaN(px) && px > 0) classes.push(`pl-${pxToSpacing(px)}`)
      break

    // Margin
    case 'margin-top':
      if (!isNaN(px)) classes.push(px >= 0 ? `mt-${pxToSpacing(px)}` : `-mt-${pxToSpacing(-px)}`)
      break
    case 'margin-bottom':
      if (!isNaN(px)) classes.push(px >= 0 ? `mb-${pxToSpacing(px)}` : `-mb-${pxToSpacing(-px)}`)
      break
    case 'margin-left':
      if (value === 'auto') classes.push('ml-auto')
      else if (!isNaN(px)) classes.push(`ml-${pxToSpacing(px)}`)
      break
    case 'margin-right':
      if (value === 'auto') classes.push('mr-auto')
      else if (!isNaN(px)) classes.push(`mr-${pxToSpacing(px)}`)
      break

    // Position
    case 'position':
      if (['relative', 'absolute', 'fixed', 'sticky'].includes(value)) classes.push(value)
      break

    // Colors
    case 'color':
      classes.push(`text-${colorToTw(value)}`)
      break
    case 'background-color':
      if (value !== 'rgba(0, 0, 0, 0)') classes.push(`bg-${colorToTw(value)}`)
      break

    // Typography
    case 'font-size':
      if (!isNaN(px)) classes.push(`text-${fontSizeToTw(px)}`)
      break
    case 'font-weight': {
      const fwMap: Record<string, string> = {
        '100': 'font-thin', '200': 'font-extralight', '300': 'font-light',
        '400': 'font-normal', '500': 'font-medium', '600': 'font-semibold',
        '700': 'font-bold', '800': 'font-extrabold', '900': 'font-black',
      }
      if (fwMap[value]) classes.push(fwMap[value])
      break
    }
    case 'text-align': {
      const taMap: Record<string, string> = {
        'left': 'text-left', 'center': 'text-center', 'right': 'text-right', 'justify': 'text-justify',
      }
      if (taMap[value]) classes.push(taMap[value])
      break
    }
    case 'text-transform': {
      const ttMap: Record<string, string> = {
        'uppercase': 'uppercase', 'lowercase': 'lowercase', 'capitalize': 'capitalize',
      }
      if (ttMap[value]) classes.push(ttMap[value])
      break
    }
    case 'line-height':
      // Only add if significantly different from default
      break
    case 'letter-spacing':
      if (!isNaN(px) && px !== 0) {
        if (px < 0) classes.push('tracking-tighter')
        else if (px < 0.5) classes.push('tracking-tight')
        else if (px < 1) classes.push('tracking-wide')
        else classes.push('tracking-wider')
      }
      break

    // Borders
    case 'border-radius':
      if (!isNaN(px) && px > 0) {
        const tw = borderRadiusToTw(px)
        classes.push(tw === 'DEFAULT' ? 'rounded' : `rounded-${tw}`)
      }
      break

    // Object fit
    case 'object-fit':
      if (value === 'cover') classes.push('object-cover')
      else if (value === 'contain') classes.push('object-contain')
      else if (value === 'fill') classes.push('object-fill')
      break

    // Overflow
    case 'overflow':
      if (value === 'hidden') classes.push('overflow-hidden')
      else if (value === 'scroll') classes.push('overflow-scroll')
      break

    // Opacity
    case 'opacity':
      if (parseFloat(value) < 1) {
        const pct = Math.round(parseFloat(value) * 100)
        classes.push(`opacity-${pct}`)
      }
      break
  }

  return classes
}

// ============================================================================
// Build the converter function as a string for injection into the iframe
// ============================================================================

/**
 * Returns a JavaScript function body (string) that can run in the browser.
 * Call: convertElementToTailwind(element) → returns outerHTML with Tailwind classes
 */
export function getTailwindConverterScript(): string {
  // Inline the mapping tables as browser-executable JS
  return `
function pxToSpacing(px) {
  var m = {0:'0',1:'px',2:'0.5',4:'1',6:'1.5',8:'2',10:'2.5',12:'3',14:'3.5',16:'4',20:'5',24:'6',28:'7',32:'8',36:'9',40:'10',44:'11',48:'12',56:'14',64:'16',72:'18',80:'20',96:'24'};
  if (m[px] !== undefined) return m[px];
  if (px > 96) return '[' + px + 'px]';
  var keys = Object.keys(m).map(Number).sort(function(a,b){return a-b});
  var c = keys.reduce(function(p,k){return Math.abs(k-px)<Math.abs(p-px)?k:p});
  return Math.abs(c-px)<=2 ? m[c] : '['+px+'px]';
}

function fontSizeToTw(px) {
  var m = {12:'xs',14:'sm',16:'base',18:'lg',20:'xl',24:'2xl',30:'3xl',36:'4xl',48:'5xl',60:'6xl'};
  if (m[px]) return m[px];
  var keys = Object.keys(m).map(Number).sort(function(a,b){return a-b});
  var c = keys.reduce(function(p,k){return Math.abs(k-px)<Math.abs(p-px)?k:p});
  return Math.abs(c-px)<=1 ? m[c] : '['+px+'px]';
}

function rgbToHex(rgb) {
  var m = rgb.match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/);
  if (!m) return rgb;
  return '#'+[m[1],m[2],m[3]].map(function(n){return parseInt(n).toString(16).padStart(2,'0')}).join('');
}

function colorToTw(rgb) {
  var cm = {'rgb(0, 0, 0)':'black','rgb(255, 255, 255)':'white','rgba(0, 0, 0, 0)':'transparent'};
  if (cm[rgb]) return cm[rgb];
  var hex = rgbToHex(rgb);
  return hex.startsWith('#') ? '['+hex+']' : '['+rgb+']';
}

function cssToTw(prop, val) {
  if (!val || val==='none'||val==='normal'||val==='auto'||val==='0px'||val==='rgba(0, 0, 0, 0)') return [];
  var px = parseFloat(val), cls = [];
  switch(prop) {
    case 'display':
      var dm={'block':'block','inline-block':'inline-block','flex':'flex','grid':'grid','inline-flex':'inline-flex','none':'hidden'};
      if(dm[val]) cls.push(dm[val]); break;
    case 'flex-direction':
      if(val==='column') cls.push('flex-col'); else if(val==='row-reverse') cls.push('flex-row-reverse'); break;
    case 'flex-wrap':
      if(val==='wrap') cls.push('flex-wrap'); break;
    case 'align-items':
      var ai={'flex-start':'items-start','flex-end':'items-end','center':'items-center','stretch':'items-stretch','baseline':'items-baseline'};
      if(ai[val]) cls.push(ai[val]); break;
    case 'justify-content':
      var jc={'flex-start':'justify-start','flex-end':'justify-end','center':'justify-center','space-between':'justify-between','space-around':'justify-around'};
      if(jc[val]) cls.push(jc[val]); break;
    case 'grid-template-columns':
      var cm=val.match(/repeat\\((\\d+),/i); if(cm) cls.push('grid-cols-'+cm[1]);
      else { var fr=(val.match(/\\d+fr/g)||[]).length; if(fr>0) cls.push('grid-cols-'+fr); }
      break;
    case 'gap': case 'grid-gap':
      if(!isNaN(px)&&px>0) cls.push('gap-'+pxToSpacing(px)); break;
    case 'column-gap':
      if(!isNaN(px)&&px>0) cls.push('gap-x-'+pxToSpacing(px)); break;
    case 'row-gap':
      if(!isNaN(px)&&px>0) cls.push('gap-y-'+pxToSpacing(px)); break;
    case 'width':
      if(val==='100%') cls.push('w-full'); break;
    case 'max-width':
      if(val==='100%') cls.push('max-w-full'); else if(!isNaN(px)&&px>0) cls.push('max-w-['+px+'px]'); break;
    case 'min-height':
      if(!isNaN(px)&&px>0) cls.push('min-h-['+px+'px]'); break;
    case 'padding':
      if(!isNaN(px)&&px>0) cls.push('p-'+pxToSpacing(px)); break;
    case 'padding-top':
      if(!isNaN(px)&&px>0) cls.push('pt-'+pxToSpacing(px)); break;
    case 'padding-right':
      if(!isNaN(px)&&px>0) cls.push('pr-'+pxToSpacing(px)); break;
    case 'padding-bottom':
      if(!isNaN(px)&&px>0) cls.push('pb-'+pxToSpacing(px)); break;
    case 'padding-left':
      if(!isNaN(px)&&px>0) cls.push('pl-'+pxToSpacing(px)); break;
    case 'margin-top':
      if(!isNaN(px)&&px!==0) cls.push((px>=0?'mt-':'−mt-')+pxToSpacing(Math.abs(px))); break;
    case 'margin-bottom':
      if(!isNaN(px)&&px!==0) cls.push((px>=0?'mb-':'−mb-')+pxToSpacing(Math.abs(px))); break;
    case 'margin-left':
      if(val==='auto') cls.push('ml-auto'); break;
    case 'margin-right':
      if(val==='auto') cls.push('mr-auto'); break;
    case 'position':
      if(['relative','absolute','fixed','sticky'].indexOf(val)>=0) cls.push(val); break;
    case 'color':
      cls.push('text-'+colorToTw(val)); break;
    case 'background-color':
      cls.push('bg-'+colorToTw(val)); break;
    case 'font-size':
      if(!isNaN(px)) cls.push('text-'+fontSizeToTw(px)); break;
    case 'font-weight':
      var fw={'400':'font-normal','500':'font-medium','600':'font-semibold','700':'font-bold','800':'font-extrabold','900':'font-black','300':'font-light'};
      if(fw[val]) cls.push(fw[val]); break;
    case 'text-align':
      var ta={'left':'text-left','center':'text-center','right':'text-right','justify':'text-justify'};
      if(ta[val]) cls.push(ta[val]); break;
    case 'text-transform':
      if(val==='uppercase') cls.push('uppercase'); else if(val==='lowercase') cls.push('lowercase'); else if(val==='capitalize') cls.push('capitalize'); break;
    case 'border-radius':
      if(!isNaN(px)&&px>0) { if(px>=9999) cls.push('rounded-full'); else if(px<=2) cls.push('rounded-sm'); else if(px<=4) cls.push('rounded'); else if(px<=6) cls.push('rounded-md'); else if(px<=8) cls.push('rounded-lg'); else if(px<=12) cls.push('rounded-xl'); else cls.push('rounded-['+px+'px]'); } break;
    case 'object-fit':
      if(val==='cover') cls.push('object-cover'); else if(val==='contain') cls.push('object-contain'); break;
    case 'overflow':
      if(val==='hidden') cls.push('overflow-hidden'); break;
    case 'opacity':
      var op=parseFloat(val); if(op<1) cls.push('opacity-'+Math.round(op*100)); break;
  }
  return cls;
}

var CONVERT_PROPS = ['display','flex-direction','flex-wrap','align-items','justify-content',
  'grid-template-columns','gap','column-gap','row-gap',
  'width','max-width','min-height','position',
  'padding','padding-top','padding-right','padding-bottom','padding-left',
  'margin-top','margin-bottom','margin-left','margin-right',
  'color','background-color','font-size','font-weight','text-align','text-transform',
  'border-radius','object-fit','overflow','opacity'];

function convertElement(el, clone) {
  var computed = window.getComputedStyle(el);
  var twClasses = [];
  for (var i = 0; i < CONVERT_PROPS.length; i++) {
    var val = computed.getPropertyValue(CONVERT_PROPS[i]);
    var tw = cssToTw(CONVERT_PROPS[i], val);
    for (var j = 0; j < tw.length; j++) twClasses.push(tw[j]);
  }
  if (twClasses.length > 0) {
    clone.setAttribute('class', twClasses.join(' '));
  } else {
    clone.removeAttribute('class');
  }
  clone.removeAttribute('style');
  var srcCh = el.children, clnCh = clone.children;
  for (var k = 0; k < srcCh.length && k < clnCh.length; k++) {
    if (srcCh[k].nodeType === 1) convertElement(srcCh[k], clnCh[k]);
  }
}
`
}
