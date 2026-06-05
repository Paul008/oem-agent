// Pure CSS-computed-value -> Tailwind/inline-style rules for Smart Capture.
// Authored as ONE self-contained function so use-capture-injection can inject
// tailwindRules.toString() into the page (minification-safe: no outside refs).
// Single source of truth; unit-tested directly.
// NOTE: to exercise the stringified body in a test, eval the BUNDLER output, not a raw
// `tsx`/esbuild dev transform — the dev transform injects `__name()` name-keeper calls that
// don't exist in the reconstructed scope (ReferenceError). The Vite production build does not
// (verified: no `__name` in the chunk), so the real in-page injection path is unaffected.
export function tailwindRules() {
  function pxToSp(px: number): string {
    var m: Record<number, string>={0:'0',1:'px',2:'0.5',4:'1',6:'1.5',8:'2',10:'2.5',12:'3',14:'3.5',16:'4',20:'5',24:'6',28:'7',32:'8',36:'9',40:'10',44:'11',48:'12',56:'14',64:'16',72:'18',80:'20',96:'24'};
    if(m[px]!==undefined)return m[px]; return px>96?'['+px+'px]':'['+px+'px]';
  }
  function fsTw(px: number): string {
    var m: Record<number, string>={12:'xs',14:'sm',16:'base',18:'lg',20:'xl',24:'2xl',30:'3xl',36:'4xl',48:'5xl',60:'6xl'};
    return m[px] ? m[px] : '['+px+'px]';
  }
  function pxText(px: number): string {
    return String(Math.round(px * 100) / 100) + 'px';
  }
  function responsiveFontSize(px: number): string {
    if (isNaN(px) || px < 24) return '';
    var min = 20;
    var vw = 4;
    if (px >= 72) { min = 32; vw = 8; }
    else if (px >= 48) { min = 28; vw = 6; }
    else if (px >= 32) { min = 24; vw = 5; }
    return 'font-size:clamp(' + min + 'px,' + vw + 'vw,' + pxText(px) + ')';
  }
  function responsiveLength(prop: string, val: string): string {
    var px = parseFloat(val);
    if (isNaN(px) || px <= 0 || val.indexOf('px') < 0) return '';
    if (prop === 'width') return 'width:min(100%,' + pxText(px) + ')';
    if (prop === 'min-width') return 'min-width:min(100%,' + pxText(px) + ')';
    if (prop === 'max-width') return 'max-width:min(100%,' + pxText(px) + ')';
    if (prop === 'min-height') return 'min-height:min(100svh,' + pxText(px) + ')';
    return '';
  }
  function rgbHex(rgb: string): string {
    var m=rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/); if(!m)return rgb;
    return '#'+[m[1],m[2],m[3]].map(function(n){return parseInt(n).toString(16).padStart(2,'0')}).join('');
  }
  function colTw(rgb: string): string {
    if(rgb==='rgb(0, 0, 0)')return 'black'; if(rgb==='rgb(255, 255, 255)')return 'white'; if(rgb==='rgba(0, 0, 0, 0)')return 'transparent';
    var h=rgbHex(rgb); return h.startsWith('#')?'['+h+']':'['+rgb.replace(/\s+/g,'')+']';
  }
  function cssTw(prop: string, val: string): string[] {
    if(!val||val==='none'||val==='normal'||val==='auto'||val==='0px'||val==='rgba(0, 0, 0, 0)')return [];
    var px=parseFloat(val),cls: string[]=[];
    switch(prop){
      case 'display': var dm: Record<string, string>={block:'block','inline-block':'inline-block',flex:'flex',grid:'grid',none:'hidden','inline-flex':'inline-flex'}; if(dm[val])cls.push(dm[val]);break;
      case 'flex-direction': if(val==='column')cls.push('flex-col');else if(val==='row-reverse')cls.push('flex-row-reverse');break;
      case 'flex-wrap': if(val==='wrap')cls.push('flex-wrap');break;
      case 'align-items': var ai: Record<string, string>={'flex-start':'items-start','flex-end':'items-end',center:'items-center',stretch:'items-stretch',baseline:'items-baseline'}; if(ai[val])cls.push(ai[val]);break;
      case 'justify-content': var jc: Record<string, string>={'flex-start':'justify-start','flex-end':'justify-end',center:'justify-center','space-between':'justify-between','space-around':'justify-around'}; if(jc[val])cls.push(jc[val]);break;
      case 'grid-template-columns': var cm=val.match(/repeat\((\d+),/i); if(cm)cls.push('grid-cols-'+cm[1]); else{var fr=(val.match(/\d+fr/g)||[]).length;if(fr>0)cls.push('grid-cols-'+fr);} break;
      case 'gap':case 'grid-gap': if(!isNaN(px)&&px>0)cls.push('gap-'+pxToSp(px));break;
      case 'column-gap': if(!isNaN(px)&&px>0)cls.push('gap-x-'+pxToSp(px));break;
      case 'row-gap': if(!isNaN(px)&&px>0)cls.push('gap-y-'+pxToSp(px));break;
      case 'width':
        if(val==='100%')cls.push('w-full');
        else if(val.endsWith('%')){var pct=parseFloat(val);
          if(Math.abs(pct-8.33)<1)cls.push('w-1/12');
          else if(Math.abs(pct-16.67)<1)cls.push('w-2/12');
          else if(Math.abs(pct-25)<1)cls.push('w-1/4');
          else if(Math.abs(pct-33.33)<1)cls.push('w-1/3');
          else if(Math.abs(pct-41.67)<1)cls.push('w-5/12');
          else if(Math.abs(pct-50)<1)cls.push('w-1/2');
          else if(Math.abs(pct-58.33)<1)cls.push('w-7/12');
          else if(Math.abs(pct-66.67)<1)cls.push('w-2/3');
          else if(Math.abs(pct-75)<1)cls.push('w-3/4');
          else if(Math.abs(pct-83.33)<1)cls.push('w-10/12');
          else if(Math.abs(pct-91.67)<1)cls.push('w-11/12');
          else cls.push('w-['+val+']');
        }
        break;
      case 'max-width': if(val==='100%')cls.push('max-w-full');else if(!isNaN(px)&&px>0)cls.push('max-w-['+px+'px]');break;
      case 'min-height': if(!isNaN(px)&&px>0)cls.push('min-h-['+px+'px]');break;
      case 'padding-top': if(!isNaN(px)&&px>0)cls.push('pt-'+pxToSp(px));break;
      case 'padding-right': if(!isNaN(px)&&px>0)cls.push('pr-'+pxToSp(px));break;
      case 'padding-bottom': if(!isNaN(px)&&px>0)cls.push('pb-'+pxToSp(px));break;
      case 'padding-left': if(!isNaN(px)&&px>0)cls.push('pl-'+pxToSp(px));break;
      case 'margin-top': if(!isNaN(px)&&px>0)cls.push('mt-'+pxToSp(px));break;
      case 'margin-bottom': if(!isNaN(px)&&px>0)cls.push('mb-'+pxToSp(px));break;
      case 'margin-left': if(val==='auto')cls.push('ml-auto');break;
      case 'margin-right': if(val==='auto')cls.push('mr-auto');break;
      case 'flex-grow': if(val==='1')cls.push('grow');else if(val==='0')cls.push('grow-0');break;
      case 'flex-shrink': if(val==='0')cls.push('shrink-0');break;
      case 'flex-basis':
        if(val==='0px'||val==='0%')cls.push('basis-0');
        else if(val==='100%')cls.push('basis-full');
        else if(val==='auto')break;
        else if(val.endsWith('%')){var bpct=parseFloat(val);
          if(Math.abs(bpct-41.67)<1)cls.push('basis-5/12');
          else if(Math.abs(bpct-50)<1)cls.push('basis-1/2');
          else if(Math.abs(bpct-58.33)<1)cls.push('basis-7/12');
          else if(Math.abs(bpct-33.33)<1)cls.push('basis-1/3');
          else if(Math.abs(bpct-66.67)<1)cls.push('basis-2/3');
          else if(Math.abs(bpct-25)<1)cls.push('basis-1/4');
          else if(Math.abs(bpct-75)<1)cls.push('basis-3/4');
          else cls.push('basis-['+val+']');
        }
        break;
      case 'position': if(['relative','absolute','fixed','sticky'].indexOf(val)>=0)cls.push(val);break;
      case 'color': cls.push('text-'+colTw(val));break;
      case 'background-color': cls.push('bg-'+colTw(val));break;
      case 'font-size': if(!isNaN(px))cls.push('text-'+fsTw(px));break;
      case 'font-weight': var fw: Record<string, string>={'400':'font-normal','500':'font-medium','600':'font-semibold','700':'font-bold','800':'font-extrabold'}; cls.push(fw[val]?fw[val]:'font-['+val+']');break;
      case 'text-align': var ta: Record<string, string>={left:'text-left',center:'text-center',right:'text-right'}; if(ta[val])cls.push(ta[val]);break;
      case 'text-transform': if(val==='uppercase')cls.push('uppercase');else if(val==='capitalize')cls.push('capitalize');break;
      case 'border-radius': if(!isNaN(px)&&px>0){if(px>=9999)cls.push('rounded-full');else cls.push('rounded-['+px+'px]');}break;
      case 'object-fit': if(val==='cover')cls.push('object-cover');else if(val==='contain')cls.push('object-contain');break;
      case 'overflow': if(val==='hidden')cls.push('overflow-hidden');break;
      case 'opacity': var op=parseFloat(val);if(op<1&&op>=0){var s=op===0?'0':String(op).replace(/^0/,'');cls.push('opacity-['+s+']');}break;
      case 'line-height': if(val.indexOf('px')>=0){if(!isNaN(px)&&px>0)cls.push('leading-['+px+'px]');}else{var lh: number=parseFloat(val);if(!isNaN(lh))cls.push('leading-['+lh+']');}break;
      case 'letter-spacing': if(!isNaN(px))cls.push('tracking-['+px+'px]');break;
      case 'top': if(!isNaN(px))cls.push('top-['+px+'px]');break;
      case 'right': if(!isNaN(px))cls.push('right-['+px+'px]');break;
      case 'bottom': if(!isNaN(px))cls.push('bottom-['+px+'px]');break;
      case 'left': if(!isNaN(px))cls.push('left-['+px+'px]');break;
      case 'z-index': if(/^-?\d+$/.test(val))cls.push('z-['+val+']');break;
      case 'min-width': if(!isNaN(px)&&px>0)cls.push('min-w-['+px+'px]');break;
      case 'font-style': if(val==='italic')cls.push('italic');break;
      case 'text-decoration': if(val.indexOf('underline')>=0)cls.push('underline');else if(val.indexOf('line-through')>=0)cls.push('line-through');break;
      case 'font-family': var fam: string=val.split(',')[0].replace(/["']/g,'').trim();if(fam){cls.push('font-['+fam.replace(/\s+/g,'_')+']');}break;
    }
    return cls;
  }
  // Bootstrap/framework class → Tailwind class mapping (tailwindo-style)
  var CLASS_MAP: Record<string, string> = {
    // Display
    'd-flex':'flex','d-inline-flex':'inline-flex','d-block':'block','d-inline-block':'inline-block',
    'd-none':'hidden','d-grid':'grid','d-inline':'inline','d-table':'table',
    // Flex
    'flex-row':'flex-row','flex-column':'flex-col','flex-row-reverse':'flex-row-reverse',
    'flex-column-reverse':'flex-col-reverse','flex-wrap':'flex-wrap','flex-nowrap':'flex-nowrap',
    'flex-grow-0':'grow-0','flex-grow-1':'grow','flex-shrink-0':'shrink-0','flex-shrink-1':'shrink',
    'flex-fill':'flex-1',
    // Align
    'justify-content-start':'justify-start','justify-content-end':'justify-end',
    'justify-content-center':'justify-center','justify-content-between':'justify-between',
    'justify-content-around':'justify-around','justify-content-evenly':'justify-evenly',
    'align-items-start':'items-start','align-items-end':'items-end',
    'align-items-center':'items-center','align-items-baseline':'items-baseline',
    'align-items-stretch':'items-stretch','align-self-center':'self-center',
    'align-self-start':'self-start','align-self-end':'self-end',
    // Text
    'text-center':'text-center','text-left':'text-left','text-right':'text-right',
    'text-uppercase':'uppercase','text-lowercase':'lowercase','text-capitalize':'capitalize',
    'text-nowrap':'whitespace-nowrap','text-truncate':'truncate',
    'font-weight-bold':'font-bold','font-weight-normal':'font-normal',
    'font-weight-light':'font-light','fw-bold':'font-bold','fw-normal':'font-normal',
    'fw-semibold':'font-semibold','fw-medium':'font-medium',
    'fst-italic':'italic','font-italic':'italic',
    // Spacing (Bootstrap mt-auto etc. → same in Tailwind)
    'mt-auto':'mt-auto','mb-auto':'mb-auto','ml-auto':'ml-auto','mr-auto':'mr-auto',
    'mx-auto':'mx-auto','my-auto':'my-auto','ms-auto':'ms-auto','me-auto':'me-auto',
    // Sizing
    'w-100':'w-full','w-75':'w-3/4','w-50':'w-1/2','w-25':'w-1/4','w-auto':'w-auto',
    'h-100':'h-full','h-auto':'h-auto','mw-100':'max-w-full',
    // Position
    'position-relative':'relative','position-absolute':'absolute',
    'position-fixed':'fixed','position-sticky':'sticky',
    // Overflow
    'overflow-hidden':'overflow-hidden','overflow-auto':'overflow-auto',
    'overflow-visible':'overflow-visible','overflow-scroll':'overflow-scroll',
    // Visibility
    'visible':'visible','invisible':'invisible',
    // Border
    'rounded':'rounded','rounded-circle':'rounded-full','rounded-pill':'rounded-full',
    'rounded-0':'rounded-none','border':'border','border-0':'border-0',
    // Image
    'img-fluid':'w-full h-auto','img-responsive':'w-full h-auto',
    // Other
    'shadow':'shadow','shadow-sm':'shadow-sm','shadow-lg':'shadow-lg','shadow-none':'shadow-none',
    'list-unstyled':'list-none',
  };

  // Bootstrap col-* → Tailwind width (handles responsive prefixes)
  function mapColClass(cls: string): string | null {
    var m = cls.match(/^col-(xs|sm|md|lg|xl|xxl)-(\d+)$/);
    if (m) {
      var prefix = m[1] === 'xs' ? '' : m[1] + ':';
      var n = parseInt(m[2]);
      var fracs: Record<number, string> = {1:'1/12',2:'2/12',3:'1/4',4:'1/3',5:'5/12',6:'1/2',7:'7/12',8:'2/3',9:'3/4',10:'10/12',11:'11/12',12:'w-full'};
      return n === 12 ? prefix + 'w-full' : prefix + 'w-' + (fracs[n] || n + '/12');
    }
    // col-{n} without breakpoint
    var m2 = cls.match(/^col-(\d+)$/);
    if (m2) {
      var n2 = parseInt(m2[1]);
      var fracs2: Record<number, string> = {1:'1/12',2:'2/12',3:'1/4',4:'1/3',5:'5/12',6:'1/2',7:'7/12',8:'2/3',9:'3/4',10:'10/12',11:'11/12',12:'full'};
      return 'w-' + (fracs2[n2] || n2 + '/12');
    }
    // bare "col" = flex grow
    if (cls === 'col') return 'flex-1';
    return null;
  }

  // Map all classes on an element from Bootstrap/framework → Tailwind
  function mapClasses(originalClasses: string): string[] {
    if (!originalClasses) return [];
    var result: string[] = [];
    var classes = originalClasses.split(/\s+/);
    for (var i = 0; i < classes.length; i++) {
      var c = classes[i].trim();
      if (!c) continue;
      // Direct mapping
      if (CLASS_MAP[c]) { result.push(CLASS_MAP[c]); continue; }
      // Column mapping
      var col = mapColClass(c);
      if (col) { result.push(col); continue; }
      // Bootstrap spacing: p-3, mt-4, mx-2 etc. (same syntax in Tailwind)
      if (/^[pm][trblxyse]?-[0-5]$/.test(c)) { result.push(c); continue; }
      // Skip framework-specific classes that have no Tailwind equivalent
      if (c.startsWith('BCX') || c.startsWith('SCX') || c.startsWith('Outline') || c.startsWith('Ltr')) continue;
      // Keep unknown classes as-is (might be custom/BEM)
      // result.push(c);  // uncomment to preserve unknown classes
    }
    return result;
  }

  // styleTw: inline-style escape hatch for un-tokenizable CSS props.
  var INLINE_STYLE_PROPS: Record<string, number> = {
    'color':1,
    'background-color':1,
    'box-shadow':1,
    'background-image':1,
    'background-size':1,
    'background-position':1,
    'background-repeat':1,
    'object-position':1,
    'aspect-ratio':1,
    'transform':1,
    'filter':1,
    'backdrop-filter':1,
    'clip-path':1,
    'mask':1
  };
  function styleTw(prop: string, val: string): string {
    if (!val || val === 'none' || val === 'normal' || val === 'auto' || val === 'rgba(0, 0, 0, 0)') return '';
    var dynamicLength = responsiveLength(prop, val);
    if (dynamicLength) return dynamicLength;
    if (prop === 'font-size') return responsiveFontSize(parseFloat(val));
    if (prop === 'background-position' && (val === '0% 0%' || val === '0px 0px')) return '';
    if (prop === 'background-repeat' && val === 'repeat') return '';
    if (prop === 'object-position' && val === '50% 50%') return '';
    if (!INLINE_STYLE_PROPS[prop]) return '';
    return prop + ':' + val;
  }

  function borderTw(read: (prop: string) => string): { classes: string[], style: string } {
    var sides = ['top', 'right', 'bottom', 'left'];
    var TOKEN: Record<string, number> = { solid: 1, dashed: 1, dotted: 1, double: 1 };
    var present: string[] = [];
    var info: Record<string, { w: string, s: string, c: string }> = {};
    for (var i = 0; i < sides.length; i++) {
      var side = sides[i];
      var w = read('border-' + side + '-width');
      var s = read('border-' + side + '-style');
      var c = read('border-' + side + '-color');
      var px = parseFloat(w);
      if (!isNaN(px) && px > 0 && s && s !== 'none') {
        present.push(side);
        info[side] = { w: px + 'px', s: s, c: c };
      }
    }
    if (present.length === 0) return { classes: [], style: '' };

    var first = info[present[0]];
    var allFour = present.length === 4;
    var samW = true, samS = true, samC = true;
    for (var j = 0; j < present.length; j++) {
      var d = info[present[j]];
      if (d.w !== first.w) samW = false;
      if (d.s !== first.s) samS = false;
      if (d.c !== first.c) samC = false;
    }
    var hex = rgbHex(first.c);
    var uniform = allFour && samW && samS && samC && !!TOKEN[first.s] && hex.charAt(0) === '#';
    if (uniform) {
      return {
        classes: ['border-[length:' + first.w + ']', 'border-[color:' + hex + ']', 'border-' + first.s],
        style: '',
      };
    }
    var decls: string[] = [];
    for (var k = 0; k < present.length; k++) {
      var p = present[k];
      var pd = info[p];
      decls.push('border-' + p + ':' + pd.w + ' ' + pd.s + ' ' + pd.c);
    }
    return { classes: [], style: decls.join(';') };
  }

  return { pxToSp: pxToSp, fsTw: fsTw, rgbHex: rgbHex, colTw: colTw, cssTw: cssTw, mapClasses: mapClasses, styleTw: styleTw, borderTw: borderTw };
}
