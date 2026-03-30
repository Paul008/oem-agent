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
    // Check for background images in inline styles
    el.querySelectorAll('*').forEach(function(node) {
      var bg = window.getComputedStyle(node).backgroundImage;
      if (bg && bg !== 'none') {
        var match = bg.match(/url\\(['"]?(https?:\\/\\/[^'"\\)]+)/);
        if (match) urls.push(match[1]);
      }
    });
    // Dedupe
    return urls.filter(function(v, i, a) { return a.indexOf(v) === i; });
  }

  // Extract key computed values for the root element only (not children)
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

  // Clean the HTML: strip inline styles, keep classes and structure
  function cleanHtml(el) {
    var clone = el.cloneNode(true);
    clone.removeAttribute('data-capture-hover');
    clone.removeAttribute('data-capture-selected');
    // Strip all inline styles — the AI works from class names + structure
    clone.querySelectorAll('*').forEach(function(node) {
      node.removeAttribute('style');
    });
    clone.removeAttribute('style');
    // Strip scripts
    clone.querySelectorAll('script').forEach(function(s) { s.remove(); });
    // Fix relative URLs to absolute
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
