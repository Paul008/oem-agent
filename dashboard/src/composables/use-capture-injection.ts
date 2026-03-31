/**
 * Builds the HTML to inject into the capture iframe.
 * Separated from the Vue SFC to avoid parser issues with
 * literal </style> and </script> tags inside template literals.
 */
export function buildCaptureInjection(): { earlyStub: string; lateInjection: string } {
  const css = `
    /* Force collapsed JS-dependent containers to be visible */
    .swiper, .swiper-wrapper, .swiper-slide,
    .splide, .splide__track, .splide__list, .splide__slide,
    .slick-slider, .slick-list, .slick-track, .slick-slide,
    .carousel, .carousel-inner, .carousel-item,
    [class*="carousel"], [class*="slider"], [class*="swiper"] {
      display: block !important;
      overflow: visible !important;
      visibility: visible !important;
      opacity: 1 !important;
      height: auto !important;
      max-height: none !important;
      transform: none !important;
      position: relative !important;
    }
    .swiper-slide, .splide__slide, .slick-slide, .carousel-item {
      width: 100% !important;
      flex-shrink: 0 !important;
    }

    [data-capture-hover] {
      outline: 3px solid #3b82f6 !important;
      outline-offset: -3px;
      cursor: pointer !important;
    }
    [data-capture-selected] {
      outline: 3px solid #22c55e !important;
      outline-offset: -3px;
    }
    #capture-tooltip {
      position: fixed;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e293b;
      color: white;
      font-size: 12px;
      padding: 6px 14px;
      border-radius: 8px;
      z-index: 999999;
      pointer-events: none;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 12px;
      white-space: nowrap;
      transition: opacity 0.15s;
    }
    #capture-tooltip .tag {
      background: #3b82f6;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    #capture-tooltip .meta {
      opacity: 0.7;
      font-size: 11px;
    }
    #capture-tooltip .hint {
      opacity: 0.5;
      font-size: 10px;
      border-left: 1px solid rgba(255,255,255,0.2);
      padding-left: 10px;
    }
  `

  // Stub history API to prevent SecurityError in srcdoc iframes
  const historyStub = `try {
  var _origPush = history.pushState, _origReplace = history.replaceState;
  history.pushState = function() { try { return _origPush.apply(this, arguments); } catch(e) {} };
  history.replaceState = function() { try { return _origReplace.apply(this, arguments); } catch(e) {} };
} catch(e) {}`

  const js = `(function() {
  console.log('[SectionCapture] Injection script loaded');
  var ignore = new Set(['HTML','BODY','HEAD','SCRIPT','STYLE','LINK','META','NOSCRIPT','BR','HR']);
  var hovered = null;
  var selectionLevel = 0; // 0 = section, positive = drill-down levels

  // Build the info tooltip
  var tooltip = document.createElement('div');
  tooltip.id = 'capture-tooltip';
  tooltip.style.opacity = '0';
  document.body.appendChild(tooltip);

  function updateTooltip(el) {
    if (!el) { tooltip.style.opacity = '0'; return; }
    var tag = el.tagName.toLowerCase();
    var cls = (el.className || '').split(/\\s+/).filter(function(c) { return c && !c.startsWith('data-') }).slice(0, 2).join(' ');
    var imgs = el.querySelectorAll('img').length;
    var children = el.children.length;
    var w = el.offsetWidth;
    var h = el.offsetHeight;

    var label = cls || tag;
    var meta = w + ' x ' + h + 'px';
    if (imgs) meta += ' · ' + imgs + ' image' + (imgs > 1 ? 's' : '');
    if (children > 1) meta += ' · ' + children + ' items';

    tooltip.innerHTML =
      '<span class="tag">' + tag + '</span>' +
      '<span>' + label + '</span>' +
      '<span class="meta">' + meta + '</span>' +
      '<span class="hint">Right-click: choose type · \\u2325+Scroll: resize</span>';
    tooltip.style.opacity = '1';
  }

  // Build ancestor chain for an element (for scroll navigation)
  function getAncestors(el) {
    var chain = [];
    while (el && el !== document.body && el !== document.documentElement) {
      if (!ignore.has(el.tagName) && el.offsetHeight >= 20 && el.offsetWidth >= 20) {
        chain.push(el);
      }
      el = el.parentElement;
    }
    return chain; // [deepest, ..., shallowest]
  }

  var currentTarget = null; // raw mouseover target
  var ancestors = [];

  // Find the best default selection level — a page-section-level element
  // Prefers <section>, <article>, or any element that spans near-full page width
  function findDefaultLevel(chain) {
    var pageWidth = document.documentElement.clientWidth;
    var best = 0;
    for (var i = 0; i < chain.length; i++) {
      var el = chain[i];
      // Prefer <section> and <article> tags
      if (el.tagName === 'SECTION' || el.tagName === 'ARTICLE') return i;
      // Also pick large containers that span most of the page width
      if (el.offsetWidth >= pageWidth * 0.75 && el.offsetHeight >= 100 && el.children.length > 0) {
        best = i;
      }
    }
    return best;
  }

  document.addEventListener('mouseover', function(e) {
    currentTarget = e.target;
    var newAncestors = getAncestors(e.target);
    // Only reset selection level when hovering a genuinely new element tree
    if (newAncestors.length !== ancestors.length || (newAncestors[0] !== ancestors[0])) {
      ancestors = newAncestors;
      selectionLevel = findDefaultLevel(ancestors);
    }
    // Clamp
    if (selectionLevel >= ancestors.length) selectionLevel = ancestors.length - 1;
    if (selectionLevel < 0) selectionLevel = 0;

    var el = ancestors[selectionLevel] || ancestors[0];
    if (!el) return;
    if (hovered && hovered !== el) hovered.removeAttribute('data-capture-hover');
    el.setAttribute('data-capture-hover', '');
    hovered = el;
    updateTooltip(el);
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (hovered) {
      hovered.removeAttribute('data-capture-hover');
      hovered = null;
    }
    updateTooltip(null);
  }, true);

  // Alt + Scroll wheel: resize selection (up = bigger/parent, down = smaller/child)
  // Normal scroll without Alt scrolls the page as expected
  document.addEventListener('wheel', function(e) {
    if (!ancestors.length || !e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY < 0) {
      // Scroll up = expand to parent
      selectionLevel = Math.min(selectionLevel + 1, ancestors.length - 1);
    } else {
      // Scroll down = drill into child
      selectionLevel = Math.max(selectionLevel - 1, 0);
    }
    var el = ancestors[selectionLevel];
    if (!el) return;
    if (hovered && hovered !== el) hovered.removeAttribute('data-capture-hover');
    el.setAttribute('data-capture-hover', '');
    hovered = el;
    updateTooltip(el);
  }, { capture: true, passive: false });

  // Extract all image URLs from an element
  function extractImageUrls(el) {
    var urls = [];
    var base = document.location.origin;
    el.querySelectorAll('img[src],source[srcset],video[poster]').forEach(function(node) {
      var src = node.getAttribute('src') || '';
      if (src) {
        if (src.startsWith('/') && !src.startsWith('//')) src = base + src;
        if (src.startsWith('http')) urls.push(src);
      }
      var srcset = node.getAttribute('srcset') || '';
      if (srcset) {
        srcset.split(',').forEach(function(entry) {
          var u = entry.trim().split(/\\s+/)[0];
          if (u.startsWith('/') && !u.startsWith('//')) u = base + u;
          if (u.startsWith('http')) urls.push(u);
        });
      }
    });
    el.querySelectorAll('*').forEach(function(node) {
      var bg = window.getComputedStyle(node).backgroundImage;
      if (bg && bg !== 'none') {
        var match = bg.match(/url\\(['"]?(https?:\\/\\/[^'"\\)]+)/);
        if (match) urls.push(match[1]);
      }
    });
    return urls.filter(function(v, i, a) { return a.indexOf(v) === i; });
  }

  function extractRootStyles(el) {
    var computed = window.getComputedStyle(el);
    return {
      display: computed.display,
      gridTemplateColumns: computed.gridTemplateColumns,
      gridGap: computed.gap || computed.gridGap,
      flexDirection: computed.flexDirection,
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      padding: computed.padding,
      width: el.offsetWidth + 'px',
      height: el.offsetHeight + 'px',
    };
  }

  // CSS-to-Tailwind converter (deterministic, no AI)
  function pxToSp(px) {
    var m={0:'0',1:'px',2:'0.5',4:'1',6:'1.5',8:'2',10:'2.5',12:'3',14:'3.5',16:'4',20:'5',24:'6',28:'7',32:'8',36:'9',40:'10',44:'11',48:'12',56:'14',64:'16',72:'18',80:'20',96:'24'};
    if(m[px]!==undefined)return m[px]; return px>96?'['+px+'px]':'['+px+'px]';
  }
  function fsTw(px) {
    var m={12:'xs',14:'sm',16:'base',18:'lg',20:'xl',24:'2xl',30:'3xl',36:'4xl',48:'5xl',60:'6xl'};
    if(m[px])return m[px]; var ks=Object.keys(m).map(Number); var c=ks.reduce(function(p,k){return Math.abs(k-px)<Math.abs(p-px)?k:p}); return Math.abs(c-px)<=1?m[c]:'['+px+'px]';
  }
  function rgbHex(rgb) {
    var m=rgb.match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/); if(!m)return rgb;
    return '#'+[m[1],m[2],m[3]].map(function(n){return parseInt(n).toString(16).padStart(2,'0')}).join('');
  }
  function colTw(rgb) {
    if(rgb==='rgb(0, 0, 0)')return 'black'; if(rgb==='rgb(255, 255, 255)')return 'white'; if(rgb==='rgba(0, 0, 0, 0)')return 'transparent';
    var h=rgbHex(rgb); return h.startsWith('#')?'['+h+']':'['+rgb+']';
  }
  function cssTw(prop,val) {
    if(!val||val==='none'||val==='normal'||val==='auto'||val==='0px'||val==='rgba(0, 0, 0, 0)')return [];
    var px=parseFloat(val),cls=[];
    switch(prop){
      case 'display': var dm={block:'block','inline-block':'inline-block',flex:'flex',grid:'grid',none:'hidden','inline-flex':'inline-flex'}; if(dm[val])cls.push(dm[val]);break;
      case 'flex-direction': if(val==='column')cls.push('flex-col');else if(val==='row-reverse')cls.push('flex-row-reverse');break;
      case 'flex-wrap': if(val==='wrap')cls.push('flex-wrap');break;
      case 'align-items': var ai={'flex-start':'items-start','flex-end':'items-end',center:'items-center',stretch:'items-stretch',baseline:'items-baseline'}; if(ai[val])cls.push(ai[val]);break;
      case 'justify-content': var jc={'flex-start':'justify-start','flex-end':'justify-end',center:'justify-center','space-between':'justify-between','space-around':'justify-around'}; if(jc[val])cls.push(jc[val]);break;
      case 'grid-template-columns': var cm=val.match(/repeat\\((\\d+),/i); if(cm)cls.push('grid-cols-'+cm[1]); else{var fr=(val.match(/\\d+fr/g)||[]).length;if(fr>0)cls.push('grid-cols-'+fr);} break;
      case 'gap':case 'grid-gap': if(!isNaN(px)&&px>0)cls.push('gap-'+pxToSp(px));break;
      case 'column-gap': if(!isNaN(px)&&px>0)cls.push('gap-x-'+pxToSp(px));break;
      case 'row-gap': if(!isNaN(px)&&px>0)cls.push('gap-y-'+pxToSp(px));break;
      case 'width': if(val==='100%')cls.push('w-full');break;
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
      case 'position': if(['relative','absolute','fixed','sticky'].indexOf(val)>=0)cls.push(val);break;
      case 'color': cls.push('text-'+colTw(val));break;
      case 'background-color': cls.push('bg-'+colTw(val));break;
      case 'font-size': if(!isNaN(px))cls.push('text-'+fsTw(px));break;
      case 'font-weight': var fw={'400':'font-normal','500':'font-medium','600':'font-semibold','700':'font-bold','800':'font-extrabold'}; if(fw[val])cls.push(fw[val]);break;
      case 'text-align': var ta={left:'text-left',center:'text-center',right:'text-right'}; if(ta[val])cls.push(ta[val]);break;
      case 'text-transform': if(val==='uppercase')cls.push('uppercase');else if(val==='capitalize')cls.push('capitalize');break;
      case 'border-radius': if(!isNaN(px)&&px>0){if(px>=9999)cls.push('rounded-full');else if(px<=4)cls.push('rounded');else if(px<=8)cls.push('rounded-lg');else cls.push('rounded-['+px+'px]');}break;
      case 'object-fit': if(val==='cover')cls.push('object-cover');else if(val==='contain')cls.push('object-contain');break;
      case 'overflow': if(val==='hidden')cls.push('overflow-hidden');break;
      case 'opacity': var op=parseFloat(val);if(op<1)cls.push('opacity-'+Math.round(op*100));break;
    }
    return cls;
  }
  var TW_PROPS=['display','flex-direction','flex-wrap','align-items','justify-content',
    'grid-template-columns','gap','column-gap','row-gap','width','max-width','min-height','position',
    'padding-top','padding-right','padding-bottom','padding-left',
    'margin-top','margin-bottom','margin-left','margin-right',
    'color','background-color','font-size','font-weight','text-align','text-transform',
    'border-radius','object-fit','overflow','opacity'];

  // Convert element + children to Tailwind classes (replaces inline styles AND class names)
  function tailwindHtml(el) {
    var clone = el.cloneNode(true);
    clone.removeAttribute('data-capture-hover');
    clone.removeAttribute('data-capture-selected');
    clone.querySelectorAll('script').forEach(function(s) { s.remove(); });

    function convert(src, cln) {
      var computed = window.getComputedStyle(src);
      var twClasses = [];
      for (var i = 0; i < TW_PROPS.length; i++) {
        var val = computed.getPropertyValue(TW_PROPS[i]);
        var tw = cssTw(TW_PROPS[i], val);
        for (var j = 0; j < tw.length; j++) twClasses.push(tw[j]);
      }
      cln.setAttribute('class', twClasses.join(' '));
      cln.removeAttribute('style');
      var srcCh = src.children, clnCh = cln.children;
      for (var k = 0; k < srcCh.length && k < clnCh.length; k++) {
        if (srcCh[k].nodeType === 1) convert(srcCh[k], clnCh[k]);
      }
    }
    convert(el, clone);

    // Fix relative URLs
    var base = document.location.origin;
    clone.querySelectorAll('img[src],source[srcset],video[src],video[poster],a[href]').forEach(function(node) {
      ['src','srcset','poster','href'].forEach(function(attr) {
        var v = node.getAttribute(attr);
        if (v && v.startsWith('/') && !v.startsWith('//')) node.setAttribute(attr, base + v);
      });
    });
    return clone.outerHTML;
  }

  // Clean HTML without styles (for deterministic parser)
  function cleanHtml(el) {
    var clone = el.cloneNode(true);
    clone.removeAttribute('data-capture-hover');
    clone.removeAttribute('data-capture-selected');
    clone.querySelectorAll('*').forEach(function(node) {
      node.removeAttribute('style');
    });
    clone.removeAttribute('style');
    clone.querySelectorAll('script').forEach(function(s) { s.remove(); });
    var base = document.location.origin;
    clone.querySelectorAll('img[src],source[srcset],video[src],video[poster],a[href]').forEach(function(node) {
      ['src','srcset','poster','href'].forEach(function(attr) {
        var v = node.getAttribute(attr);
        if (v && v.startsWith('/') && !v.startsWith('//')) {
          node.setAttribute(attr, base + v);
        }
      });
    });
    return clone.outerHTML;
  }

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var el = hovered;
    if (!el) return;
    el.removeAttribute('data-capture-hover');
    el.setAttribute('data-capture-selected', '');

    var imageUrls = extractImageUrls(el);
    var rootStyles = extractRootStyles(el);
    var html = cleanHtml(el);
    var styled = tailwindHtml(el);

    window.parent.postMessage({
      type: 'section-capture',
      html: html,
      styledHtml: styled,
      imageUrls: imageUrls,
      rootStyles: rootStyles,
      tag: el.tagName.toLowerCase(),
      classes: el.className,
      width: el.offsetWidth,
      height: el.offsetHeight,
      childCount: el.children.length,
      pageUrl: document.location.href,
    }, '*');
  }, true);

  // Right-click: send data for context menu (user picks section type)
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var el = hovered;
    if (!el) return;

    var imageUrls = extractImageUrls(el);
    var rootStyles = extractRootStyles(el);
    var html = cleanHtml(el);
    var styled = tailwindHtml(el);

    window.parent.postMessage({
      type: 'section-capture-menu',
      html: html,
      styledHtml: styled,
      imageUrls: imageUrls,
      rootStyles: rootStyles,
      tag: el.tagName.toLowerCase(),
      classes: el.className,
      width: el.offsetWidth,
      height: el.offsetHeight,
      childCount: el.children.length,
      pageUrl: document.location.href,
      clientX: e.clientX,
      clientY: e.clientY,
    }, '*');
  }, true);

  document.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a');
    if (a) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();`

  const historyStubTag = '<' + 'script>' + historyStub + '</' + 'script>'
  const styleTag = '<' + 'style>' + css + '</' + 'style>'
  const scriptTag = '<' + 'script>' + js + '</' + 'script>'
  return {
    earlyStub: historyStubTag,
    lateInjection: styleTag + scriptTag,
  }
}
