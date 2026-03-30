/**
 * Builds the HTML to inject into the capture iframe.
 * Separated from the Vue SFC to avoid parser issues with
 * literal </style> and </script> tags inside template literals.
 */
export function buildCaptureInjection(): { earlyStub: string; lateInjection: string } {
  const css = [
    '[data-capture-hover] { outline: 3px solid #3b82f6 !important; outline-offset: -3px; cursor: pointer !important; }',
    '[data-capture-hover]::after { content: "Click to capture this section"; position: fixed; top: 8px; left: 50%; transform: translateX(-50%); background: #3b82f6; color: white; font-size: 12px; padding: 4px 12px; border-radius: 6px; z-index: 999999; pointer-events: none; font-family: system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }',
    '[data-capture-selected] { outline: 3px solid #22c55e !important; outline-offset: -3px; }',
  ].join('\n')

  // Stub history API to prevent SecurityError in srcdoc iframes
  // (Nuxt/Vue Router calls history.replaceState which browsers block in about:srcdoc)
  const historyStub = `try {
  var _origPush = history.pushState, _origReplace = history.replaceState;
  history.pushState = function() { try { return _origPush.apply(this, arguments); } catch(e) {} };
  history.replaceState = function() { try { return _origReplace.apply(this, arguments); } catch(e) {} };
} catch(e) {}`

  const js = `(function() {
  console.log('[SectionCapture] Injection script loaded');
  var ignore = new Set(['HTML','BODY','HEAD','SCRIPT','STYLE','LINK','META','NOSCRIPT','BR','HR']);
  var minSize = 40;
  var hovered = null;

  function findSection(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      if (!ignore.has(el.tagName) && el.offsetHeight >= minSize && el.offsetWidth >= minSize) return el;
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener('mouseover', function(e) {
    var el = findSection(e.target);
    if (!el) return;
    if (hovered && hovered !== el) hovered.removeAttribute('data-capture-hover');
    el.setAttribute('data-capture-hover', '');
    hovered = el;
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (hovered) {
      hovered.removeAttribute('data-capture-hover');
      hovered = null;
    }
  }, true);

  // Extract @font-face declarations from all stylesheets
  function extractFontFaces() {
    var fonts = [];
    try {
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        try {
          var rules = sheets[i].cssRules || sheets[i].rules;
          if (!rules) continue;
          for (var j = 0; j < rules.length; j++) {
            if (rules[j].type === CSSRule.FONT_FACE_RULE) {
              fonts.push(rules[j].cssText);
            }
          }
        } catch(e) { /* CORS blocked stylesheet */ }
      }
    } catch(e) {}
    return fonts;
  }

  // Extract CSS custom properties from :root
  function extractCssVars() {
    var vars = {};
    try {
      var rootStyle = getComputedStyle(document.documentElement);
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        try {
          var rules = sheets[i].cssRules || sheets[i].rules;
          if (!rules) continue;
          for (var j = 0; j < rules.length; j++) {
            if (rules[j].selectorText === ':root' || rules[j].selectorText === 'html') {
              var style = rules[j].style;
              for (var k = 0; k < style.length; k++) {
                var prop = style[k];
                if (prop.startsWith('--')) {
                  vars[prop] = style.getPropertyValue(prop).trim();
                }
              }
            }
          }
        } catch(e) {}
      }
    } catch(e) {}
    return vars;
  }

  // Visual properties that matter for reproducing a design
  var VISUAL_PROPS = [
    // Layout
    'display','position','top','right','bottom','left','z-index',
    'width','min-width','max-width','height','min-height','max-height',
    'margin','margin-top','margin-right','margin-bottom','margin-left',
    'padding','padding-top','padding-right','padding-bottom','padding-left',
    'box-sizing','overflow','overflow-x','overflow-y','float','clear',
    // Flexbox
    'flex','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis',
    'align-items','align-self','align-content','justify-content','justify-items',
    'gap','row-gap','column-gap','order',
    // Grid
    'grid-template-columns','grid-template-rows','grid-column','grid-row',
    'grid-auto-flow','grid-auto-columns','grid-auto-rows','grid-gap',
    // Background
    'background','background-color','background-image','background-size',
    'background-position','background-repeat','background-attachment',
    // Borders
    'border','border-top','border-right','border-bottom','border-left',
    'border-width','border-style','border-color','border-radius',
    'border-top-left-radius','border-top-right-radius',
    'border-bottom-left-radius','border-bottom-right-radius',
    // Typography
    'color','font-family','font-size','font-weight','font-style',
    'line-height','letter-spacing','text-align','text-decoration',
    'text-transform','text-overflow','white-space','word-break','word-spacing',
    // Visual
    'opacity','visibility','box-shadow','text-shadow',
    'object-fit','object-position','aspect-ratio',
    'transform','filter','backdrop-filter','mix-blend-mode',
    'clip-path','mask-image',
    // SVG
    'fill','stroke','stroke-width',
  ];

  function getVisualStyles(el) {
    var computed = window.getComputedStyle(el);
    var style = '';
    for (var i = 0; i < VISUAL_PROPS.length; i++) {
      var prop = VISUAL_PROPS[i];
      var val = computed.getPropertyValue(prop);
      if (!val || val === 'none' || val === 'normal' || val === 'auto' ||
          val === '0px' || val === '0px 0px' || val === 'rgba(0, 0, 0, 0)' ||
          val === 'start' || val === 'baseline' || val === 'stretch' ||
          val === 'visible' || val === 'static' || val === 'content-box' ||
          val === 'border-box' || val === 'row' || val === 'nowrap' ||
          val === 'repeat' || val === 'scroll' || val === '1' ||
          val === 'ltr' || val === 'inline') continue;
      style += prop + ':' + val + ';';
    }
    return style;
  }

  // Get pseudo-element styles
  function getPseudoStyles(el, pseudo) {
    var computed = window.getComputedStyle(el, pseudo);
    var content = computed.getPropertyValue('content');
    if (!content || content === 'none' || content === 'normal') return null;
    var style = '';
    var props = [
      'content','display','position','top','right','bottom','left',
      'width','height','background','background-color','background-image',
      'color','font-size','font-weight','border','border-radius',
      'opacity','transform','z-index','pointer-events'
    ];
    for (var i = 0; i < props.length; i++) {
      var val = computed.getPropertyValue(props[i]);
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px') {
        style += props[i] + ':' + val + ';';
      }
    }
    return style;
  }

  // Recursively inline visual styles (not all computed — keeps HTML clean for AI)
  function inlineStyles(source, clone) {
    clone.setAttribute('style', getVisualStyles(source));

    // Capture pseudo-elements as data attributes for AI context
    var before = getPseudoStyles(source, '::before');
    var after = getPseudoStyles(source, '::after');
    if (before) clone.setAttribute('data-pseudo-before', before);
    if (after) clone.setAttribute('data-pseudo-after', after);

    var srcChildren = source.children;
    var clnChildren = clone.children;
    for (var j = 0; j < srcChildren.length && j < clnChildren.length; j++) {
      if (srcChildren[j].nodeType === 1) inlineStyles(srcChildren[j], clnChildren[j]);
    }
  }

  function fixUrls(el) {
    var base = document.location.origin;
    el.querySelectorAll('img[src],source[srcset],video[src],video[poster]').forEach(function(node) {
      ['src','srcset','poster'].forEach(function(attr) {
        var v = node.getAttribute(attr);
        if (v && v.startsWith('/') && !v.startsWith('//')) {
          node.setAttribute(attr, base + v);
        }
      });
    });
    el.querySelectorAll('*').forEach(function(node) {
      var s = node.getAttribute('style') || '';
      if (s.includes('url(/')) {
        node.setAttribute('style', s.replace(/url\\(\\//, 'url(' + base + '/'));
      }
    });
  }

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var el = hovered;
    if (!el) return;
    el.removeAttribute('data-capture-hover');
    el.setAttribute('data-capture-selected', '');
    var clone = el.cloneNode(true);
    clone.removeAttribute('data-capture-hover');
    clone.removeAttribute('data-capture-selected');
    inlineStyles(el, clone);
    fixUrls(clone);
    clone.querySelectorAll('script').forEach(function(s) { s.remove(); });

    // Gather page-level context for the AI
    var fontFaces = extractFontFaces();
    var cssVars = extractCssVars();

    window.parent.postMessage({
      type: 'section-capture',
      html: clone.outerHTML,
      tag: el.tagName.toLowerCase(),
      classes: el.className,
      width: el.offsetWidth,
      height: el.offsetHeight,
      fontFaces: fontFaces,
      cssVars: cssVars,
      pageTitle: document.title,
      pageUrl: document.location.href,
    }, '*');
  }, true);

  document.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a');
    if (a) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();`

  // Build tags via concatenation to avoid SFC parser issues
  const historyStubTag = '<' + 'script>' + historyStub + '</' + 'script>'
  const styleTag = '<' + 'style>' + css + '</' + 'style>'
  const scriptTag = '<' + 'script>' + js + '</' + 'script>'
  return {
    earlyStub: historyStubTag,
    lateInjection: styleTag + scriptTag,
  }
}
