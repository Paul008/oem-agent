/**
 * Builds the HTML to inject into the capture iframe.
 * Separated from the Vue SFC to avoid parser issues with
 * literal </style> and </script> tags inside template literals.
 */
export function buildCaptureInjection(): { earlyStub: string; lateInjection: string } {
  const css = `
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
      '<span class="hint">\\u2325+Scroll resize</span>';
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

    window.parent.postMessage({
      type: 'section-capture',
      html: html,
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
