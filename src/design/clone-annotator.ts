/**
 * Clone Annotator — stamps Alpine directives + data-clone-* attributes onto
 * recognized interactive regions of captured clone HTML (spec §4.3).
 *
 * Attributes only: the dashboard sanitizer strips <script> elements and on*
 * attributes from stored clone HTML, so behavior ships separately (the clone
 * runtime script) and binds to these attributes at render time. Unrecognized
 * markup passes through byte-identical.
 *
 * Path coordinates: `detectInteractiveRegions` computes `rootSelectorPath`
 * against its OWN internal `load(html)` call (full-document mode — cheerio
 * always normalizes to root -> html -> head/body regardless of whether the
 * input was a bare fragment). To resolve that path back to a live node here,
 * this module must parse with the SAME full-document mode and walk from the
 * document root exactly like `elementPath` in section-parser.ts does — NOT
 * fragment mode, which has a different (shallower) coordinate system. After
 * stamping, we serialize head content + body content (in that order) to shed
 * the synthetic <html>/<head>/<body> wrapper cheerio adds while keeping any
 * leading <style>/<link> the parser hoisted into <head>, so stamped output
 * stays a plain fragment. The byte-identical pass-through test never touches
 * cheerio at all (see the zero-regions early return below), so this choice
 * doesn't affect it.
 */

import { load } from 'cheerio';

import { detectInteractiveRegions, type DetectedInteractionType } from './section-parser';
import { CLONE_INTERACTION_ATTR, CLONE_REGION_ID_ATTR } from './clone-runtime/clone-runtime';

export interface CloneInteractionInventoryEntry {
  id: string;
  type: DetectedInteractionType;
  trigger_count: number;
  panel_count: number;
}

export interface AnnotateResult {
  html: string;
  interactions: CloneInteractionInventoryEntry[];
}

// domhandler node — not part of cheerio's public type surface, so internal
// tree-walking helpers below deal in `any` rather than adding an undeclared
// dependency on the `domhandler` package (mirrors section-parser.ts).
type CheerioNode = any;

const COMPONENT_FOR_TYPE: Record<DetectedInteractionType, string> = {
  'tabs': 'cloneTabs',
  'accordion': 'cloneAccordion',
  'carousel': 'cloneCarousel',
  'gallery-lightbox': 'cloneGallery',
};

const FORCED_STYLE_PROPS = /(?:^|;)\s*(display|opacity|visibility|height|max-height|overflow)\s*:[^;]*(!important)?\s*/gi;

function classAttr(el: CheerioNode): string {
  return String(el?.attribs?.class ?? '');
}

function stripForcedStyles($el: any): void {
  const style = String($el.attr('style') ?? '');
  if (!style) return;
  const remaining = style.replace(FORCED_STYLE_PROPS, ';').replace(/;{2,}/g, ';').replace(/^;|;$/g, '').trim();
  if (remaining) $el.attr('style', remaining);
  else $el.removeAttr('style');
}

/**
 * Collapses an unselected infinite-loop clone panel: strips its capture-forced-visible inline styles
 * (display/opacity/visibility/height/overflow) then appends `display:none !important` so it occupies
 * no layout. Safe because the element duplicates content already stamped as the resolved panel — see
 * the duplicate-panel handling in the tabs branch below.
 */
function collapseDuplicatePanel($el: any): void {
  stripForcedStyles($el);
  const remaining = String($el.attr('style') ?? '').replace(/;\s*$/, '').trim();
  $el.attr('style', remaining ? `${remaining};display:none !important` : 'display:none !important');
}

/**
 * Resolves each tab trigger to its OWN tabpanel by `aria-labelledby` (panel) -> `id` (trigger),
 * rather than assuming DOM-order index N of the panel set lines up with trigger index N.
 *
 * Some OEM sliders (e.g. VW's "stage" carousel) implement an infinite-loop illusion by duplicating
 * each real slide into extra clone copies for seamless wraparound — those clones share the SAME
 * panel `id` (and hence the same `aria-labelledby` target) as the original, so a tabs region can
 * have e.g. 4 `role="tabpanel"` elements in the DOM for only 2 real triggers. Positional numbering
 * (`panels.each((i, el) => attr('data-clone-panel', i))`) then assigns index 1 to whichever panel
 * happens to be second in DOM order — which is frequently a clone belonging to a DIFFERENT trigger
 * than the one at trigger index 1, so cloneTabs.show(1) reveals the wrong slide's content entirely.
 *
 * Returns null (falls back to plain positional stamping) unless duplicate panel ids are actually
 * present AND every trigger has an id AND every trigger's id resolves to at least one panel — i.e.
 * this only changes behavior for the specific duplicate-id pattern it exists to fix.
 */
function resolveTabPanelsByAriaLabelledby(triggers: any, panels: any): CheerioNode[] | null {
  const seenPanelIds = new Set<string>();
  let hasDuplicatePanelId = false;
  panels.each((_i: number, el: CheerioNode) => {
    const id = String(el.attribs?.id ?? '');
    if (!id) return;
    if (seenPanelIds.has(id)) hasDuplicatePanelId = true;
    seenPanelIds.add(id);
  });
  if (!hasDuplicatePanelId) return null;

  const triggerIds: string[] = [];
  triggers.each((_i: number, el: CheerioNode) => { triggerIds.push(String(el.attribs?.id ?? '')); });
  if (triggerIds.some(id => !id)) return null;

  const resolved: CheerioNode[] = [];
  for (const triggerId of triggerIds) {
    const matches: CheerioNode[] = [];
    panels.each((_i: number, el: CheerioNode) => {
      if (String(el.attribs?.['aria-labelledby'] ?? '') === triggerId) matches.push(el);
    });
    if (matches.length === 0) return null;
    // Prefer whichever duplicate was NOT marked inert — that's the copy that was actually the
    // live/rendered slide at capture time. If none/all are inert (never-selected trigger), any
    // duplicate is an equivalent clone of the same content, so the first is a safe pick.
    resolved.push(matches.find(el => el.attribs?.inert === undefined) ?? matches[0]);
  }
  return resolved;
}

/**
 * Nearest common ancestor element of a set of nodes, walking each node's
 * ancestor chain and intersecting. Used to find the carousel "track" for
 * ARIA-pattern carousels, where slides are not guaranteed to be direct
 * siblings of a class-named wrapper the way swiper/slick markup is.
 */
function nearestCommonAncestor(nodes: CheerioNode[]): CheerioNode | null {
  if (nodes.length === 0) return null;
  const ancestorsOf = (node: CheerioNode): CheerioNode[] => {
    const chain: CheerioNode[] = [];
    let cursor = node.parent;
    while (cursor) { chain.push(cursor); cursor = cursor.parent; }
    return chain;
  };
  const firstChain = ancestorsOf(nodes[0]);
  let common = new Set<CheerioNode>(firstChain);
  for (let i = 1; i < nodes.length; i++) {
    const chain = new Set<CheerioNode>(ancestorsOf(nodes[i]));
    common = new Set([...common].filter(node => chain.has(node)));
  }
  return firstChain.find(node => common.has(node)) ?? null;
}

/**
 * Resolves a `rootSelectorPath` (as produced by `elementPath` in
 * section-parser.ts) back to a live node. Must walk from the document root
 * exactly the way `elementPath` counted: one index per level, tag nodes
 * only, starting at `$.root()`'s own children (which — under full-document
 * load — is the `<html>` element).
 */
function resolveByPath($: ReturnType<typeof load>, path: string): CheerioNode | null {
  const indices = path.split('.').map(Number);
  let node: CheerioNode = $.root().get(0);
  for (const index of indices) {
    const tagChildren: CheerioNode[] = (node?.children || []).filter((c: CheerioNode) => c.type === 'tag');
    node = tagChildren[index];
    if (!node) return null;
  }
  return node ?? null;
}

export function annotateCloneInteractions(html: string): AnnotateResult {
  // Idempotency: never double-stamp. Recompiles start from a fresh capture,
  // so stamped input means "already annotated this cycle".
  if (html.includes(CLONE_INTERACTION_ATTR)) {
    const $existing = load(html);
    const interactions: CloneInteractionInventoryEntry[] = [];
    $existing(`[${CLONE_INTERACTION_ATTR}]`).each((_i, el) => {
      const $el = $existing(el);
      interactions.push({
        id: String($el.attr(CLONE_REGION_ID_ATTR) ?? ''),
        type: String($el.attr(CLONE_INTERACTION_ATTR)) as DetectedInteractionType,
        trigger_count: $el.find('[data-clone-tab], [data-clone-acc-trigger], [data-clone-gallery-thumb], [data-clone-prev], [data-clone-next]').length,
        panel_count: $el.find('[data-clone-panel], [data-clone-acc-panel], [data-clone-slide], [data-clone-gallery-main]').length,
      });
    });
    return { html, interactions };
  }

  // detectInteractiveRegions parses its own copy; when it finds nothing we
  // return the original string untouched — no cheerio round-trip at all —
  // which is what guarantees byte-identical pass-through for plain markup.
  const regions = detectInteractiveRegions(html);
  if (regions.length === 0) return { html, interactions: [] };

  // Full-document mode (default `load`) — MUST match detectInteractiveRegions'
  // own parse so rootSelectorPath resolves against an identical tree.
  const $ = load(html);
  const interactions: CloneInteractionInventoryEntry[] = [];

  regions.forEach((region, regionIndex) => {
    const rootEl = resolveByPath($, region.rootSelectorPath);
    if (!rootEl) return;
    const root = $(rootEl);
    const id = `cr-${regionIndex + 1}`;

    root.attr(CLONE_INTERACTION_ATTR, region.type);
    root.attr(CLONE_REGION_ID_ATTR, id);
    root.attr('x-data', COMPONENT_FOR_TYPE[region.type]);

    if (region.type === 'tabs') {
      const ariaTriggers = root.find('[role="tab"]');
      const ariaPanels = root.find('[role="tabpanel"]');
      const triggers = ariaTriggers.length >= 2
        ? ariaTriggers
        : root.find('*').filter((_i: number, c: CheerioNode) => /tab[-_]?(item|button|trigger|link)/i.test(classAttr(c)));
      const panels = ariaPanels.length >= 2
        ? ariaPanels
        : root.find('*').filter((_i: number, c: CheerioNode) => /tab[-_]?(panel|content|pane)/i.test(classAttr(c)));
      const resolvedPanels = resolveTabPanelsByAriaLabelledby(triggers, panels);
      triggers.each((i, el) => { $(el).attr('data-clone-tab', String(i)); $(el).attr('x-on:click', 'selectTab'); });
      if (resolvedPanels) {
        const resolvedSet = new Set<CheerioNode>(resolvedPanels);
        resolvedPanels.forEach((panelEl, i) => { const $panel = $(panelEl); $panel.attr('data-clone-panel', String(i)); stripForcedStyles($panel); $panel.removeAttr('inert'); });
        // Infinite-loop slider clones: tabpanels sharing a resolved panel's id/aria-labelledby target
        // but not selected as the live copy. They keep the capture-forced-visible inline styles and
        // would each render at full slide height, stacking the whole stage (VW Amarok: ~1.8k px of
        // excess). They duplicate content already stamped as the real panel, so collapse them — this
        // marks and force-hides duplicates only, never hiding unique content.
        panels.each((_i, el) => {
          if (resolvedSet.has(el)) return;
          const $dup = $(el);
          $dup.attr('data-clone-panel-duplicate', '');
          collapseDuplicatePanel($dup);
        });
      } else {
        panels.each((i, el) => { $(el).attr('data-clone-panel', String(i)); stripForcedStyles($(el)); $(el).removeAttr('inert'); });
      }
      interactions.push({ id, type: region.type, trigger_count: triggers.length, panel_count: (resolvedPanels ?? panels).length });
    }

    if (region.type === 'accordion') {
      const triggers = root.find('button, [role="button"]').filter((_i: number, c: CheerioNode) => /accordion[-_]?(header|trigger|title|button)/i.test(classAttr(c)));
      const panels = root.find('*').filter((_i: number, c: CheerioNode) => /accordion[-_]?(content|panel|body)/i.test(classAttr(c)));
      triggers.each((i, el) => { $(el).attr('data-clone-acc-trigger', String(i)); $(el).attr('x-on:click', 'togglePanel'); });
      panels.each((i, el) => { $(el).attr('data-clone-acc-panel', String(i)); stripForcedStyles($(el)); });
      interactions.push({ id, type: region.type, trigger_count: triggers.length, panel_count: panels.length });
    }

    if (region.type === 'carousel') {
      const isAriaCarousel = String(root.attr('aria-roledescription') ?? '') === 'carousel';

      if (isAriaCarousel) {
        // W3C ARIA carousel pattern: slides carry aria-roledescription="slide"
        // (also role="group") with no reliable class hints. The "track" is
        // whichever element is the slides' nearest common parent — not
        // necessarily root's direct child, so it's computed rather than
        // assumed to be a single wrapper level down.
        const slides = root.find('[aria-roledescription="slide"]');
        const track = nearestCommonAncestor(slides.toArray());
        if (track) $(track).attr('data-clone-track', '');
        slides.each((i, el) => { $(el).attr('data-clone-slide', String(i)); });

        // Controls: buttons inside a data-testid*="arrow" wrapper, or buttons
        // whose aria-label names the direction — first match per direction wins.
        const candidates = root.find('button, a, [role="button"]').filter((_i: number, c: CheerioNode) =>
          $(c).closest('[data-testid*="arrow"]').length > 0
          || /prev|next|back|forward/i.test(String(c.attribs?.['aria-label'] ?? '')));
        const prev = candidates.filter((_i: number, c: CheerioNode) => /prev|back/i.test(String(c.attribs?.['aria-label'] ?? ''))).first();
        const next = candidates.filter((_i: number, c: CheerioNode) => /next|forward/i.test(String(c.attribs?.['aria-label'] ?? ''))).first();
        if (prev.length) { prev.attr('data-clone-prev', ''); prev.attr('x-on:click', 'prev'); }
        if (next.length) { next.attr('data-clone-next', ''); next.attr('x-on:click', 'next'); }
        interactions.push({ id, type: region.type, trigger_count: (prev.length ? 1 : 0) + (next.length ? 1 : 0), panel_count: slides.length });
      } else {
        const track = root.find('*').filter((_i: number, c: CheerioNode) => /track|wrapper|slides|slide-list|swiper-wrapper|slick-track/i.test(classAttr(c))).first();
        track.attr('data-clone-track', '');
        const slides = track.children().filter((_i: number, c: CheerioNode) => /slide|item/i.test(classAttr(c)) || String(c.attribs?.role ?? '') === 'group');
        slides.each((i, el) => { $(el).attr('data-clone-slide', String(i)); });
        const prev = root.find('button, a, [role="button"]').filter((_i: number, c: CheerioNode) => /prev|previous|arrow-left/i.test(classAttr(c))).first();
        const next = root.find('button, a, [role="button"]').filter((_i: number, c: CheerioNode) => /next|arrow-right/i.test(classAttr(c))).first();
        if (prev.length) { prev.attr('data-clone-prev', ''); prev.attr('x-on:click', 'prev'); }
        if (next.length) { next.attr('data-clone-next', ''); next.attr('x-on:click', 'next'); }
        interactions.push({ id, type: region.type, trigger_count: (prev.length ? 1 : 0) + (next.length ? 1 : 0), panel_count: slides.length });
      }
    }

    if (region.type === 'gallery-lightbox') {
      const main = root.find('img').filter((_i: number, c: CheerioNode) => /main|stage|active|current/i.test(classAttr(c))).first();
      main.attr('data-clone-gallery-main', '');
      const thumbContainers = root.find('*').filter((_i: number, c: CheerioNode) => /thumb/i.test(classAttr(c)));
      let thumbIndex = 0;
      thumbContainers.each((_i, el) => {
        const target = $(el).is('img') ? $(el) : $(el).find('img').first();
        if (!target.length || target.is('[data-clone-gallery-main]') || target.closest('[data-clone-gallery-thumb]').length) return;
        target.attr('data-clone-gallery-thumb', String(thumbIndex));
        target.attr('x-on:click', 'selectImage');
        thumbIndex += 1;
      });
      interactions.push({ id, type: region.type, trigger_count: thumbIndex, panel_count: 1 });
    }
  });

  // Full-document parsing hoists LEADING head-eligible elements (<style>,
  // <link>, <title>, <meta>) into <head>; captured fragments can open with a
  // <style> tag, so serializing body alone would silently drop it. Because
  // hoisting only ever moves a leading run of such elements, re-emitting head
  // content first restores the original order.
  return { html: ($('head').html() ?? '') + ($('body').html() ?? ''), interactions };
}
