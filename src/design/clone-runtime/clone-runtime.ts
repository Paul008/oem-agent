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
