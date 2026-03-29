/**
 * Builds the HTML to inject into the capture iframe.
 * Separated from the Vue SFC to avoid parser issues with
 * literal </style> and </script> tags inside template literals.
 */
export function buildCaptureInjection(): string {
  const css = [
    '[data-capture-hover] { outline: 3px solid #3b82f6 !important; outline-offset: -3px; cursor: pointer !important; }',
    '[data-capture-hover]::after { content: "Click to capture this section"; position: fixed; top: 8px; left: 50%; transform: translateX(-50%); background: #3b82f6; color: white; font-size: 12px; padding: 4px 12px; border-radius: 6px; z-index: 999999; pointer-events: none; font-family: system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }',
    '[data-capture-selected] { outline: 3px solid #22c55e !important; outline-offset: -3px; }',
  ].join('\n')

  const js = `(function() {
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

  function inlineStyles(source, clone) {
    var computed = window.getComputedStyle(source);
    var props = [
      'display','position','width','max-width','min-width','height','max-height','min-height',
      'margin','padding','border','border-radius','box-sizing','overflow',
      'background','background-color','background-image','background-size','background-position',
      'color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-decoration','text-transform',
      'flex','flex-direction','flex-wrap','align-items','justify-content','gap',
      'grid-template-columns','grid-template-rows','grid-gap',
      'opacity','box-shadow','transform',
      'object-fit','object-position','aspect-ratio',
    ];
    var style = '';
    for (var i = 0; i < props.length; i++) {
      var val = computed.getPropertyValue(props[i]);
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px' && val !== 'rgba(0, 0, 0, 0)') {
        style += props[i] + ':' + val + ';';
      }
    }
    clone.setAttribute('style', (clone.getAttribute('style') || '') + style);
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
        node.setAttribute('style', s.replace(/url\\\\(\\\\//g, 'url(' + base + '/'));
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
    window.parent.postMessage({
      type: 'section-capture',
      html: clone.outerHTML,
      tag: el.tagName.toLowerCase(),
      width: el.offsetWidth,
      height: el.offsetHeight,
    }, '*');
  }, true);

  document.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a');
    if (a) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();`

  // Build tags via concatenation to avoid SFC parser issues
  const styleTag = '<' + 'style>' + css + '</' + 'style>'
  const scriptTag = '<' + 'script>' + js + '</' + 'script>'
  return styleTag + scriptTag
}
