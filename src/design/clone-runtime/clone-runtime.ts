/**
 * Clone Runtime — owned interaction behavior for captured OEM clones.
 *
 * The compiled clone HTML carries only attributes (x-data / x-on:click /
 * data-clone-*) because the dashboard sanitizer strips <script> elements.
 * This module produces the trusted script body that each rendering surface
 * injects alongside the sanitized markup. Component behavior is imperative
 * (methods manipulate styles directly) so the Alpine CSP build needs no
 * inline expressions and no unsafe-eval.
 *
 * The registration block MUST precede the Alpine library: Alpine fires
 * `alpine:init` synchronously during startup, and components registered
 * after startup never bind.
 */

import { ALPINE_CSP_JS, ALPINE_CSP_VERSION } from './alpine-csp';

export const CLONE_RUNTIME_VERSION = 'clone-runtime-v1';
export const CLONE_INTERACTION_ATTR = 'data-clone-interaction';
export const CLONE_REGION_ID_ATTR = 'data-clone-region-id';

const COMPONENTS_JS = `
// Overlay chrome for cloneFeatureOverlay. Every rule is scoped under the
// stamped region root, so nothing can leak into the dealer shell; z-index is
// high but bounded (dealer chat widgets commonly sit at 2147483647).
function cloneFeatureOverlayStyles() {
  if (document.getElementById('clone-feature-overlay-styles')) return;
  var style = document.createElement('style');
  style.id = 'clone-feature-overlay-styles';
  // The overlay lives inside the clone scope, where the captured OEM stylesheet
  // styles bare elements with !important at specificity (0,3,1) — e.g. Nissan's
  // scoped "header { position:absolute!important }". Tripling the class lifts
  // every rule to (0,4,0) so overlay chrome always wins; load-bearing layout
  // properties are additionally pinned with !important.
  var fo = function (cls) { return '[data-clone-interaction="feature-overlay"] .' + cls + '.' + cls + '.' + cls; };
  style.textContent = [
    '[data-clone-interaction="feature-overlay"] { position: relative; }',
    fo('clone-fo-trigger') + ' { display: inline-flex !important; align-items: center; gap: 10px; margin: 16px; padding: 10px 18px; border: 1px solid #000; background: #fff; color: #000; font-size: 13px; letter-spacing: 2px; cursor: pointer; position: absolute !important; bottom: 24px; left: 24px; top: auto !important; right: auto !important; width: auto !important; height: auto !important; z-index: 5; }',
    fo('clone-fo-trigger') + ':hover { background: #000; color: #fff; }',
    fo('clone-fo-trigger-plus') + ' { font-size: 18px; line-height: 1; }',
    fo('clone-fo-overlay') + ' { position: fixed !important; inset: 0 !important; z-index: 99990; background: rgba(0,0,0,0.55); display: flex !important; align-items: stretch; justify-content: center; margin: 0 !important; padding: 0 !important; width: auto !important; height: auto !important; }',
    fo('clone-fo-panel') + ' { position: relative !important; background: #fff; color: #000; width: 100% !important; max-width: 1100px !important; overflow-y: auto !important; padding: 64px 48px; margin: 0 !important; float: none !important; }',
    fo('clone-fo-close') + ' { position: absolute !important; top: 16px !important; right: 20px !important; bottom: auto !important; left: auto !important; width: 44px !important; height: 44px !important; border: 0; background: transparent; color: #000; font-size: 32px; line-height: 1; cursor: pointer; z-index: 1; }',
    fo('clone-fo-header') + ' { position: static !important; inset: auto !important; width: auto !important; height: auto !important; margin: 0 0 32px !important; float: none !important; }',
    fo('clone-fo-eyebrow') + ' { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 8px; position: static !important; }',
    fo('clone-fo-title') + ' { font-size: 32px; margin: 0; position: static !important; }',
    fo('clone-fo-item') + ' { position: static !important; float: none !important; margin: 0 0 48px !important; width: auto !important; height: auto !important; }',
    fo('clone-fo-image') + ' { display: block !important; width: 100% !important; height: auto !important; max-width: 100% !important; margin: 0 0 20px !important; position: static !important; }',
    fo('clone-fo-item-label') + ' { font-size: 20px; letter-spacing: 1px; margin: 0 0 12px; position: static !important; }',
    fo('clone-fo-item-description') + ' { font-size: 15px; line-height: 1.7; margin: 0; position: static !important; }',
    '@media (max-width: 767px) { ' + fo('clone-fo-panel') + ' { padding: 56px 20px; } }',
  ].join('\\n');
  document.head.appendChild(style);
}

document.addEventListener('alpine:init', function () {
  Alpine.data('cloneTabs', function () {
    return {
      triggers: [],
      panels: [],
      init: function () {
        this.triggers = Array.from(this.$el.querySelectorAll('[data-clone-tab]'));
        this.panels = Array.from(this.$el.querySelectorAll('[data-clone-panel]'));
        var selected = this.triggers.findIndex(function (t) {
          return t.getAttribute('aria-selected') === 'true';
        });
        this.show(selected >= 0 ? selected : 0);
      },
      selectTab: function (event) {
        var index = Number(event.currentTarget.getAttribute('data-clone-tab'));
        if (Number.isFinite(index)) this.show(index);
      },
      show: function (index) {
        this.panels.forEach(function (panel) {
          var i = Number(panel.getAttribute('data-clone-panel'));
          if (i === index) {
            // Force-show rather than removeProperty(): the annotator strips forced display styles
            // from every stamped panel (including whichever was active at capture time), so falling
            // back to the captured stylesheet is not reliable — OEM markup frequently has no class-based
            // "visible" rule at all (visibility was driven by JS/inline styles we intentionally stripped).
            panel.style.setProperty('display', 'block', 'important');
          } else {
            panel.style.setProperty('display', 'none', 'important');
          }
        });
        this.triggers.forEach(function (trigger) {
          var i = Number(trigger.getAttribute('data-clone-tab'));
          trigger.setAttribute('aria-selected', i === index ? 'true' : 'false');
        });
      },
    };
  });

  Alpine.data('cloneAccordion', function () {
    return {
      // $el is bound to whichever element the CURRENT expression/directive is
      // evaluated against — inside init() that's this component's own x-data
      // root, but inside an event handler invoked from a click on a
      // descendant trigger, $el resolves to that TRIGGER, not the root. Cache
      // the root once (while $el is still correct) so later handlers query
      // against the right scope regardless of which descendant fired the event.
      root: null,
      init: function () {
        this.root = this.$el;
        var panels = this.root.querySelectorAll('[data-clone-acc-panel]');
        Array.from(panels).forEach(function (panel) {
          var trigger = panel.parentElement
            ? panel.parentElement.querySelector('[data-clone-acc-trigger="' + panel.getAttribute('data-clone-acc-panel') + '"]')
            : null;
          var expanded = trigger && trigger.getAttribute('aria-expanded') === 'true';
          if (!expanded) panel.style.setProperty('display', 'none', 'important');
        });
      },
      togglePanel: function (event) {
        var trigger = event.currentTarget;
        var index = trigger.getAttribute('data-clone-acc-trigger');
        var panel = this.root.querySelector('[data-clone-acc-panel="' + index + '"]');
        if (!panel) return;
        var hidden = panel.style.display === 'none';
        if (hidden) {
          // Same reasoning as cloneTabs.show(): force-show rather than removeProperty(), since the
          // annotator strips forced display styles from stamped accordion panels too, and the captured
          // stylesheet cannot be relied on to provide a visible default.
          panel.style.setProperty('display', 'block', 'important');
          trigger.setAttribute('aria-expanded', 'true');
        } else {
          panel.style.setProperty('display', 'none', 'important');
          trigger.setAttribute('aria-expanded', 'false');
        }
      },
    };
  });

  Alpine.data('cloneCarousel', function () {
    return {
      index: 0,
      track: null,
      slides: [],
      // See cloneAccordion's root comment above: $el inside next()/prev()/update() (invoked from a
      // click on a descendant prev/next button) resolves to that BUTTON, not this component's root —
      // caching it here (while $el is still root, during init) is what makes update() write the
      // carousel-index attribute and read arrow-relative DOM state against the right element.
      root: null,
      init: function () {
        this.root = this.$el;
        // The annotator lands data-clone-track on the slides' nearest common ancestor, which for an
        // ARIA carousel whose slides are direct children of the carousel root IS the root (same
        // element as x-data). querySelector never matches self, so fall back to the root itself.
        this.track = this.root.matches('[data-clone-track]') ? this.root : this.root.querySelector('[data-clone-track]');
        this.slides = this.track ? Array.from(this.track.querySelectorAll('[data-clone-slide]')) : [];
        if (this.track) {
          this.track.style.setProperty('display', 'flex', 'important');
          this.track.style.setProperty('transition', 'transform 240ms ease', 'important');
          this.track.style.setProperty('overflow', 'visible');
        }
        if (this.root.style) this.root.style.setProperty('overflow', 'hidden', 'important');
        this.update();
      },
      next: function () {
        if (this.slides.length === 0) return;
        this.index = (this.index + 1) % this.slides.length;
        this.update();
      },
      prev: function () {
        if (this.slides.length === 0) return;
        this.index = (this.index - 1 + this.slides.length) % this.slides.length;
        this.update();
      },
      update: function () {
        if (!this.track || this.slides.length === 0) return;
        var offset = this.slides[this.index].offsetLeft - this.slides[0].offsetLeft;
        this.track.style.setProperty('transform', 'translateX(' + (-offset) + 'px)', 'important');
        this.root.setAttribute('data-clone-carousel-index', String(this.index));
      },
    };
  });

  Alpine.data('cloneFeatureOverlay', function () {
    return {
      root: null,
      overlay: null,
      lastFocused: null,
      savedHtmlOverflow: '',
      savedBodyOverflow: '',
      keydownHandler: null,
      init: function () {
        this.root = this.$el;
        cloneFeatureOverlayStyles();
        // Today's Nissan captures carry no learn-more trigger DOM (the AEM
        // app renders it client-side, after capture) — so when the annotator
        // stamped none, this component renders its own. Runtime-created
        // elements live outside stored HTML, so CSP/inertness is unaffected.
        if (!this.root.querySelector('[data-clone-overlay-trigger]')) {
          var props = this.readProps();
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'clone-fo-trigger';
          var plus = document.createElement('span');
          plus.className = 'clone-fo-trigger-plus';
          plus.setAttribute('aria-hidden', 'true');
          plus.textContent = '+';
          var label = document.createElement('span');
          label.textContent = (props && props.ctaLabel) || 'LEARN MORE';
          button.appendChild(plus);
          button.appendChild(label);
          var self = this;
          button.addEventListener('click', function () { self.open(); });
          this.root.appendChild(button);
        }
      },
      openOverlay: function () { this.open(); },
      readProps: function () {
        // Lazy + defensive: compprops shapes drift per AEM component; render
        // nothing rather than throw (values are treated as untrusted text —
        // textContent only, never innerHTML).
        var raw = this.root.getAttribute('data-compprops');
        if (!raw) return null;
        var parsed;
        try { parsed = JSON.parse(raw); } catch (error) { return null; }
        if (!parsed || typeof parsed !== 'object') return null;
        var items = Array.isArray(parsed.featureItems) ? parsed.featureItems.filter(function (item) { return item && typeof item === 'object'; }) : [];
        return {
          items: items,
          ctaLabel: typeof parsed.ctaText === 'string' && parsed.ctaText ? parsed.ctaText
            : (typeof parsed.buttonText === 'string' && parsed.buttonText ? parsed.buttonText : null),
          title: typeof parsed.title === 'string' ? parsed.title : null,
          subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : null,
        };
      },
      resolveImage: function (item) {
        var width = window.innerWidth || 1024;
        var path = (width >= 1024 && item.desktopImagePath)
          || (width >= 768 && item.tabletImagePath)
          || item.mobileImagePath || item.tabletImagePath || item.desktopImagePath;
        if (!path || typeof path !== 'string') return null;
        // Captured pages route media through the worker proxy under a
        // per-model assets prefix (…/media/pages/assets/<oem>/<model>/<file>);
        // the server side handles the .ximg fallback. Reuse the prefix from
        // any already-proxied image on the page, with the absolute
        // nissan-cdn URL as the error fallback — overlay images referenced
        // only in compprops JSON were never captured into every model's
        // asset space (e.g. X-Trail's compprops reference Ariya asset names).
        var absolute = path.slice(0, 2) === '//' ? 'https:' + path : path;
        var basename = path.split('/').pop();
        var proxied = document.querySelector('img[src*="/media/pages/assets/"]');
        if (proxied && basename) {
          var src = proxied.getAttribute('src') || '';
          var cut = src.indexOf('/media/pages/assets/');
          var prefix = src.slice(0, src.lastIndexOf('/'));
          if (cut >= 0 && prefix) return { src: prefix + '/' + basename, fallback: absolute };
        }
        return { src: absolute, fallback: null };
      },
      open: function () {
        if (this.overlay) return;
        var props = this.readProps();
        if (!props || props.items.length === 0) return;
        var self = this;

        var overlay = document.createElement('div');
        overlay.className = 'clone-fo-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        if (props.title) overlay.setAttribute('aria-label', props.title);
        overlay.addEventListener('click', function (event) {
          if (event.target === overlay) self.close();
        });

        var panel = document.createElement('div');
        panel.className = 'clone-fo-panel';

        var closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'clone-fo-close';
        closeButton.setAttribute('aria-label', 'Close');
        closeButton.textContent = '\\u00d7';
        closeButton.addEventListener('click', function () { self.close(); });
        panel.appendChild(closeButton);

        if (props.subtitle || props.title) {
          var header = document.createElement('header');
          header.className = 'clone-fo-header';
          if (props.subtitle) {
            var eyebrow = document.createElement('p');
            eyebrow.className = 'clone-fo-eyebrow';
            eyebrow.textContent = props.subtitle;
            header.appendChild(eyebrow);
          }
          if (props.title) {
            var heading = document.createElement('h2');
            heading.className = 'clone-fo-title';
            heading.textContent = props.title;
            header.appendChild(heading);
          }
          panel.appendChild(header);
        }

        props.items.forEach(function (item) {
          var figure = document.createElement('figure');
          figure.className = 'clone-fo-item';
          var resolved = self.resolveImage(item);
          if (resolved) {
            var image = document.createElement('img');
            image.className = 'clone-fo-image';
            image.alt = typeof item.imageAltText === 'string' ? item.imageAltText : '';
            image.loading = 'lazy';
            if (resolved.fallback && resolved.fallback !== resolved.src) {
              var fallbackSrc = resolved.fallback;
              image.addEventListener('error', function () {
                if (image.src !== fallbackSrc) image.src = fallbackSrc;
              }, { once: true });
            }
            image.src = resolved.src;
            figure.appendChild(image);
          }
          var caption = document.createElement('figcaption');
          if (typeof item.label === 'string' && item.label) {
            var itemLabel = document.createElement('h3');
            itemLabel.className = 'clone-fo-item-label';
            itemLabel.textContent = item.label;
            caption.appendChild(itemLabel);
          }
          if (typeof item.featureDescription === 'string' && item.featureDescription) {
            var description = document.createElement('p');
            description.className = 'clone-fo-item-description';
            description.textContent = item.featureDescription;
            caption.appendChild(description);
          }
          if (caption.childNodes.length > 0) figure.appendChild(caption);
          if (figure.childNodes.length > 0) panel.appendChild(figure);
        });

        overlay.appendChild(panel);
        this.root.appendChild(overlay);
        this.overlay = overlay;

        // Scroll lock — saved so close() restores the host page exactly.
        this.savedHtmlOverflow = document.documentElement.style.overflow;
        this.savedBodyOverflow = document.body.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        // ESC + focus trap.
        this.lastFocused = document.activeElement;
        this.keydownHandler = function (event) {
          if (event.key === 'Escape') { self.close(); return; }
          if (event.key !== 'Tab' || !self.overlay) return;
          var focusables = self.overlay.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
          if (focusables.length === 0) return;
          var first = focusables[0];
          var last = focusables[focusables.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', this.keydownHandler);
        closeButton.focus();
      },
      close: function () {
        if (!this.overlay) return;
        if (this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
        this.overlay = null;
        document.documentElement.style.overflow = this.savedHtmlOverflow;
        document.body.style.overflow = this.savedBodyOverflow;
        if (this.keydownHandler) { document.removeEventListener('keydown', this.keydownHandler); this.keydownHandler = null; }
        if (this.lastFocused && this.lastFocused.focus) this.lastFocused.focus();
        this.lastFocused = null;
      },
    };
  });

  Alpine.data('cloneGallery', function () {
    return {
      // See cloneAccordion's root comment above: selectImage() runs from a click on a descendant
      // thumbnail, where $el resolves to that thumbnail rather than this component's root.
      root: null,
      init: function () {
        this.root = this.$el;
      },
      selectImage: function (event) {
        var thumb = event.currentTarget;
        var main = this.root.querySelector('[data-clone-gallery-main]');
        if (!main) return;
        var thumbImg = thumb.tagName === 'IMG' ? thumb : thumb.querySelector('img');
        var src = thumb.getAttribute('data-clone-full-src') || (thumbImg && (thumbImg.currentSrc || thumbImg.src));
        if (!src) return;
        main.setAttribute('src', src);
        main.removeAttribute('srcset');
        this.root.setAttribute('data-clone-gallery-selected', thumb.getAttribute('data-clone-gallery-thumb') || '');
      },
    };
  });
});
`;

export function buildCloneRuntimeScript(): string {
  // Registration first, library second — see module docblock.
  const body = `${COMPONENTS_JS}\n;${ALPINE_CSP_JS}`;
  // A literal "</script" inside an inline script terminates the surrounding
  // tag; split the sequence so embedding is always safe.
  return body.replace(/<\/script/gi, '<\\/script');
}

export const CLONE_RUNTIME_LIBRARY_VERSION = ALPINE_CSP_VERSION;
