// Pure CSS-computed-value -> Tailwind/inline-style rules for Smart Capture.
// Authored as ONE self-contained function so use-capture-injection can inject
// tailwindRules.toString() into the page (minification-safe: no outside refs).
// Single source of truth; unit-tested directly.
export function tailwindRules() {
  function pxToSp(px: number): string {
    var m: Record<number, string>={0:'0',1:'px',2:'0.5',4:'1',6:'1.5',8:'2',10:'2.5',12:'3',14:'3.5',16:'4',20:'5',24:'6',28:'7',32:'8',36:'9',40:'10',44:'11',48:'12',56:'14',64:'16',72:'18',80:'20',96:'24'};
    if(m[px]!==undefined)return m[px]; return px>96?'['+px+'px]':'['+px+'px]';
  }
  function fsTw(px: number): string {
    var m: Record<number, string>={12:'xs',14:'sm',16:'base',18:'lg',20:'xl',24:'2xl',30:'3xl',36:'4xl',48:'5xl',60:'6xl'};
    if(m[px])return m[px]; var ks=Object.keys(m).map(Number); var c=ks.reduce(function(p,k){return Math.abs(k-px)<Math.abs(p-px)?k:p}); return Math.abs(c-px)<=1?m[c]:'['+px+'px]';
  }
  function rgbHex(rgb: string): string {
    var m=rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/); if(!m)return rgb;
    return '#'+[m[1],m[2],m[3]].map(function(n){return parseInt(n).toString(16).padStart(2,'0')}).join('');
  }
  function colTw(rgb: string): string {
    if(rgb==='rgb(0, 0, 0)')return 'black'; if(rgb==='rgb(255, 255, 255)')return 'white'; if(rgb==='rgba(0, 0, 0, 0)')return 'transparent';
    var h=rgbHex(rgb); return h.startsWith('#')?'['+h+']':'['+rgb+']';
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
      case 'font-weight': var fw: Record<string, string>={'400':'font-normal','500':'font-medium','600':'font-semibold','700':'font-bold','800':'font-extrabold'}; if(fw[val])cls.push(fw[val]);break;
      case 'text-align': var ta: Record<string, string>={left:'text-left',center:'text-center',right:'text-right'}; if(ta[val])cls.push(ta[val]);break;
      case 'text-transform': if(val==='uppercase')cls.push('uppercase');else if(val==='capitalize')cls.push('capitalize');break;
      case 'border-radius': if(!isNaN(px)&&px>0){if(px>=9999)cls.push('rounded-full');else if(px<=4)cls.push('rounded');else if(px<=8)cls.push('rounded-lg');else cls.push('rounded-['+px+'px]');}break;
      case 'object-fit': if(val==='cover')cls.push('object-cover');else if(val==='contain')cls.push('object-contain');break;
      case 'overflow': if(val==='hidden')cls.push('overflow-hidden');break;
      case 'opacity': var op=parseFloat(val);if(op<1)cls.push('opacity-'+Math.round(op*100));break;
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

  // styleTw: inline-style escape hatch. Stub for now (Task 6 implements it).
  function styleTw(_prop: string, _val: string): string { return ''; }

  return { pxToSp: pxToSp, fsTw: fsTw, rgbHex: rgbHex, colTw: colTw, cssTw: cssTw, mapClasses: mapClasses, styleTw: styleTw };
}
