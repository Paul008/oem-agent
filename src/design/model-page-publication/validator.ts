import { load } from 'cheerio';
import postcss from 'postcss';

import {
  PUBLICATION_ALPINE_RUNTIME_SCRIPT,
  PUBLICATION_INTERACTION_SCRIPT,
  PUBLICATION_SCRIPT_MARKERS,
  isPublicationResizeScriptForRevision,
  publicationContentSecurityPolicy,
  type ComposedPublicationCandidate,
} from './composer';
import {
  validateInBrowser,
  type BrowserValidationOptions,
  type PublicationEvidenceRecord,
  type PublicationFinding,
  type PublicationViewportName,
  type PublicationViewportValidation,
} from './browser-validator';

export type { PublicationFinding } from './browser-validator';

export interface PublicationValidationReport {
  publishable: boolean;
  blocking: PublicationFinding[];
  warnings: PublicationFinding[];
  viewports: PublicationViewportValidation[];
  digest: string;
}

export type PublicationValidationOptions = BrowserValidationOptions;

// 10MB raw; OEM CDN stylesheets are inlined scoped (Nissan alone contributes ~5MB of CSS) and
// the artifact gzips to well under 1MB over the wire.
const MAX_BODY_BYTES = 10_485_760;
const PLATFORM_REGION = /^(?:hero|variants?|inventory)$/i;
const PLATFORM_ROLE = /^(?:hero|variants?|inventory)$/i;
const PLATFORM_COMPID = /(?:hero|grade-walk|variants?|inventory|stock)-(?:section-)?comp/i;
const URL_ATTRIBUTES = ['href', 'src', 'poster', 'action', 'formaction', 'xlink:href'];
const SAFE_PROTOCOLS = new Set(['https:', 'mailto:', 'tel:', 'data:', 'blob:']);

function finding(code: string, message: string, regionId?: string): PublicationFinding {
  return { code, message, ...(regionId ? { regionId } : {}) };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Base64(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function validationDigest(report: Omit<PublicationValidationReport, 'digest'>): Promise<string> {
  return sha256Hex(canonicalJson(report));
}

export async function parsePublicationValidationReport(value: unknown): Promise<PublicationValidationReport> {
  if (!isRecord(value)
    || typeof value.publishable !== 'boolean'
    || !Array.isArray(value.blocking)
    || !Array.isArray(value.warnings)
    || !Array.isArray(value.viewports)
    || !isNonEmptyString(value.digest)) {
    throw new Error('Publication revision validation is malformed');
  }
  const reportWithoutDigest: Omit<PublicationValidationReport, 'digest'> = {
    publishable: value.publishable,
    blocking: value.blocking.map(parsePublicationFinding),
    warnings: value.warnings.map(parsePublicationFinding),
    viewports: value.viewports.map(parseViewportValidation),
  };
  const digest = await validationDigest(reportWithoutDigest);
  if (value.digest !== digest) {
    throw new Error('Publication validation digest does not match its report');
  }
  return { ...reportWithoutDigest, digest: value.digest };
}

function parsePublicationFinding(value: unknown): PublicationFinding {
  const viewport = isRecord(value) ? value.viewport : undefined;
  if (!isRecord(value)
    || !isNonEmptyString(value.code)
    || !isNonEmptyString(value.message)
    || (viewport !== undefined && !isViewportName(viewport))
    || (value.regionId !== undefined && !isNonEmptyString(value.regionId))) {
    throw new Error('Publication revision validation is malformed');
  }
  return {
    code: value.code,
    message: value.message,
    ...(viewport !== undefined ? { viewport } : {}),
    ...(value.regionId !== undefined ? { regionId: value.regionId } : {}),
  };
}

function parseViewportValidation(value: unknown): PublicationViewportValidation {
  if (!isRecord(value)
    || !isViewportName(value.name)
    || !isNonNegativeFiniteNumber(value.mismatchPercent)
    || !isNonNegativeFiniteNumber(value.horizontalOverflowPx)
    || !isNonNegativeFiniteNumber(value.bodyHeight)
    || !isStringArray(value.consoleErrors)
    || !isStringArray(value.failedRequests)
    || !Array.isArray(value.interactions)
    || (value.screenshotKey !== undefined && !isNonEmptyString(value.screenshotKey))
    || (value.diffScreenshotKey !== undefined && !isNonEmptyString(value.diffScreenshotKey))) {
    throw new Error('Publication revision validation is malformed');
  }
  return {
    name: value.name,
    mismatchPercent: value.mismatchPercent,
    horizontalOverflowPx: value.horizontalOverflowPx,
    bodyHeight: value.bodyHeight,
    consoleErrors: value.consoleErrors,
    failedRequests: value.failedRequests,
    interactions: value.interactions.map(parseInteractionResult),
    ...(value.screenshotKey !== undefined ? { screenshotKey: value.screenshotKey } : {}),
    ...(value.diffScreenshotKey !== undefined ? { diffScreenshotKey: value.diffScreenshotKey } : {}),
    ...(value.sourceSize !== undefined ? { sourceSize: parseDimensions(value.sourceSize) } : {}),
    ...(value.candidateSize !== undefined ? { candidateSize: parseDimensions(value.candidateSize) } : {}),
    ...(value.dimensionMismatchPercent !== undefined
      ? { dimensionMismatchPercent: parseNonNegativeFiniteNumber(value.dimensionMismatchPercent) }
      : {}),
    ...(value.dimensionClassification !== undefined
      ? { dimensionClassification: parseMismatchClassification(value.dimensionClassification) }
      : {}),
    ...(value.evidence !== undefined ? { evidence: parseEvidence(value.evidence) } : {}),
  };
}

function parseInteractionResult(value: unknown): PublicationViewportValidation['interactions'][number] {
  if (!isRecord(value)
    || !isNonEmptyString(value.regionId)
    || !isNonEmptyString(value.kind)
    || typeof value.passed !== 'boolean'
    || typeof value.detail !== 'string') {
    throw new Error('Publication revision validation is malformed');
  }
  return {
    regionId: value.regionId,
    kind: value.kind,
    passed: value.passed,
    detail: value.detail,
  };
}

function parseDimensions(value: unknown): { width: number; height: number } {
  if (!isRecord(value)
    || !isNonNegativeFiniteNumber(value.width)
    || !isNonNegativeFiniteNumber(value.height)) {
    throw new Error('Publication revision validation is malformed');
  }
  return { width: value.width, height: value.height };
}

function parseNonNegativeFiniteNumber(value: unknown): number {
  if (!isNonNegativeFiniteNumber(value)) throw new Error('Publication revision validation is malformed');
  return value;
}

function parseMismatchClassification(value: unknown): PublicationViewportValidation['dimensionClassification'] {
  if (value !== 'pass' && value !== 'warning' && value !== 'blocking') {
    throw new Error('Publication revision validation is malformed');
  }
  return value;
}

function parseEvidence(value: unknown): NonNullable<PublicationViewportValidation['evidence']> {
  if (!isRecord(value)) throw new Error('Publication revision validation is malformed');
  return {
    source: parseEvidenceRecord(value.source),
    candidate: parseEvidenceRecord(value.candidate),
    diff: parseEvidenceRecord(value.diff),
  };
}

function parseEvidenceRecord(value: unknown): PublicationEvidenceRecord {
  if (!isRecord(value)
    || !isNonEmptyString(value.key)
    || !Number.isInteger(value.byteLength)
    || !isNonNegativeFiniteNumber(value.byteLength)
    || !isNonEmptyString(value.sha256)) {
    throw new Error('Publication revision validation is malformed');
  }
  return { key: value.key, byteLength: value.byteLength, sha256: value.sha256 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isViewportName(value: unknown): value is PublicationViewportName {
  return value === 'desktop' || value === 'tablet' || value === 'mobile';
}

function addUnique(findings: PublicationFinding[], next: PublicationFinding): void {
  if (!findings.some(item => item.code === next.code && item.message === next.message && item.regionId === next.regionId)) {
    findings.push(next);
  }
}

function hasUnsafeProtocol(value: string): boolean {
  const normalized = value.replace(/[\u0000-\u0020\u007f]/g, '').replace(/^['"]|['"]$/g, '');
  if (!normalized || normalized.startsWith('#')) return false;
  if (normalized.startsWith('//')) return true;
  const protocol = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1];
  return Boolean(protocol && !SAFE_PROTOCOLS.has(`${protocol.toLowerCase()}:`));
}

function styleIsScoped(css: string): boolean {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!stripped) return true;
  if (/url\(\s*['"]?(?:javascript|vbscript|file):/i.test(stripped)) return false;
  try {
    const root = postcss.parse(stripped);
    let safe = true;
    root.walkAtRules(rule => {
      const name = rule.name.toLowerCase();
      const isKeyframes = /^(?:-\w+-)?keyframes$/.test(name);
      // @font-face cannot be selector-scoped and only registers fonts — it cannot style the
      // dealer shell, so it is safe to pass through unscoped (Nissan's font CSS is all @font-face).
      const isFontFace = name === 'font-face';
      const isSafeContainer = ['media', 'supports', 'container', 'layer'].includes(name) && Array.isArray(rule.nodes);
      if (!isKeyframes && !isFontFace && !isSafeContainer) safe = false;
    });
    root.walkDecls(declaration => {
      if (declaration.parent?.type === 'root') safe = false;
    });
    root.walkRules(rule => {
      let parent = rule.parent;
      while (parent && parent.type !== 'root') {
        if (parent.type === 'atrule' && /^(?:-\w+-)?keyframes$/i.test(parent.name)) return;
        parent = parent.parent;
      }
      if (!rule.selectors.every(selector => selector.trim().startsWith('[data-oem-publication-body="true"]'))) safe = false;
    });
    return safe;
  } catch {
    return false;
  }
}

async function validateTrustedScripts(
  label: 'candidate' | 'reference',
  $: ReturnType<typeof load>,
  expectedRevision: number,
): Promise<PublicationFinding[]> {
  const scripts = $('script').toArray();
  const markerEntries = [
    { marker: PUBLICATION_SCRIPT_MARKERS.alpine, valid: (body: string) => body === PUBLICATION_ALPINE_RUNTIME_SCRIPT },
    { marker: PUBLICATION_SCRIPT_MARKERS.resize, valid: (body: string) => isPublicationResizeScriptForRevision(body, expectedRevision) },
    { marker: PUBLICATION_SCRIPT_MARKERS.interactions, valid: (body: string) => body === PUBLICATION_INTERACTION_SCRIPT },
  ];
  const bodies: string[] = [];
  let scriptsTrusted = scripts.length === markerEntries.length;
  for (const entry of markerEntries) {
    const matches = scripts.filter(script => $(script).attr(entry.marker) === 'true');
    if (matches.length !== 1) {
      scriptsTrusted = false;
      continue;
    }
    const script = matches[0];
    const attributes = Object.keys((script as { attribs?: Record<string, string> }).attribs || {});
    const body = $(script).text();
    if (attributes.length !== 1 || $(script).attr('src') || !entry.valid(body)) scriptsTrusted = false;
    bodies.push(body);
  }

  const cspMetas = $('meta').toArray().filter(meta => ($(meta).attr('http-equiv') || '').toLowerCase() === 'content-security-policy');
  const csp = cspMetas.length === 1 ? $(cspMetas[0]).attr('content') || '' : '';
  const scriptDirective = csp.split(';').map(item => item.trim()).find(item => /^script-src(?:\s|$)/i.test(item));
  const tokens = scriptDirective?.split(/\s+/).slice(1) || [];
  const expectedTokens = bodies.length === 3
    ? await Promise.all(bodies.map(async body => `'sha256-${await sha256Base64(body)}'`))
    : [];
  const scriptHashesTrusted = tokens.length === 3
    && [...tokens].sort().join(' ') === [...expectedTokens].sort().join(' ');
  const expectedCsp = bodies.length === 3 ? await publicationContentSecurityPolicy(bodies) : '';
  const cspTrusted = cspMetas.length === 1 && csp === expectedCsp;
  const findings: PublicationFinding[] = [];
  if (!scriptsTrusted || !scriptHashesTrusted) {
    findings.push(finding('unsafe-script', `${label} body does not contain the exact composer-owned scripts and CSP hashes`));
  }
  if (!cspTrusted) {
    findings.push(finding('unsafe-csp', `${label} body CSP does not match the complete composer-owned policy`));
  }
  return findings;
}

// Candidate bodies carry multiple MB of inlined scoped OEM CSS. Parsing that into a cheerio
// DOM (giant text nodes) exceeds the Workers memory limit, so style CONTENTS are hollowed out
// into an array before parsing and validated one block at a time — only one postcss AST is
// alive at any moment, and the DOM the structural checks walk stays small.
const STYLE_SLOT_RE = /^\/\*oem-style-slot:(\d+)\*\/$/;

function extractStyleContents(html: string): { html: string; styles: string[] } {
  const styles: string[] = [];
  const hollowed = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_match, open: string, css: string, close: string) => {
    const index = styles.push(css) - 1;
    return `${open}/*oem-style-slot:${index}*/${close}`;
  });
  return { html: hollowed, styles };
}

async function validateMarkup(label: 'candidate' | 'reference', rawHtml: string, expectedRevision: number): Promise<PublicationFinding[]> {
  const findings: PublicationFinding[] = [];
  const { html, styles } = extractStyleContents(rawHtml);
  const $ = load(html);
  $('iframe,object,embed,base').each((_index, element) => {
    addUnique(findings, finding('unsafe-markup', `${label} body contains forbidden <${element.tagName}> markup`));
  });
  $('script').each((_index, element) => {
    const script = $(element);
    const trustedMarkers = Object.values(PUBLICATION_SCRIPT_MARKERS).filter(marker => script.attr(marker) === 'true');
    if (script.attr('src') || trustedMarkers.length !== 1) {
      addUnique(findings, finding('unsafe-markup', `${label} body contains an untrusted script`));
    }
  });
  $('*').each((_index, element) => {
    const attributes = (element as { attribs?: Record<string, string> }).attribs || {};
    for (const attribute of Object.keys(attributes)) {
      if (/^on/i.test(attribute) || attribute.toLowerCase() === 'srcdoc') {
        addUnique(findings, finding('unsafe-markup', `${label} body contains forbidden ${attribute} attribute`));
      }
    }
    for (const attribute of URL_ATTRIBUTES) {
      const value = $(element).attr(attribute);
      if (value && hasUnsafeProtocol(value)) {
        addUnique(findings, finding('unsafe-protocol', `${label} body contains an unsafe ${attribute} protocol`));
      }
    }
    const srcset = $(element).attr('srcset');
    if (srcset && srcset.split(',').some(part => hasUnsafeProtocol(part.trim().split(/\s+/)[0] || ''))) {
      addUnique(findings, finding('unsafe-protocol', `${label} body contains an unsafe srcset protocol`));
    }
    const inlineStyle = $(element).attr('style');
    if (inlineStyle && /url\(\s*['"]?(?:javascript|vbscript|file):/i.test(inlineStyle)) {
      addUnique(findings, finding('unsafe-protocol', `${label} body contains an unsafe CSS URL protocol`));
    }
  });
  const bodyStyleSlots: number[] = [];
  $('body style').each((_index, element) => {
    const slotMatch = STYLE_SLOT_RE.exec($(element).text().trim());
    if (slotMatch) {
      bodyStyleSlots.push(Number(slotMatch[1]));
    } else {
      // A style tag whose content did not round-trip through the extractor cannot be verified.
      addUnique(findings, finding('unscoped-style', `${label} body contains a style block outside the publication scope`));
    }
  });
  for (const slot of bodyStyleSlots) {
    // Sequential on purpose: one postcss AST at a time keeps peak memory bounded.
    if (!styleIsScoped(styles[slot] ?? '')) {
      addUnique(findings, finding('unscoped-style', `${label} body contains a style block outside the publication scope`));
    }
  }
  findings.push(...await validateTrustedScripts(label, $, expectedRevision));
  return findings;
}

function validateRegions(candidate: ComposedPublicationCandidate): PublicationFinding[] {
  const findings: PublicationFinding[] = [];
  // Region checks are structural only — hollow out style contents to keep the DOM small.
  const $ = load(extractStyleContents(candidate.body).html);
  const declared = new Set<string>();
  for (const region of candidate.regions) {
    const regionId = region.regionId.trim();
    if (!regionId || declared.has(regionId)) {
      addUnique(findings, finding('invalid-region-id', 'Every declared publication region must have a unique non-empty ID', regionId || undefined));
      continue;
    }
    declared.add(regionId);
    const matchingNodes = $('[data-oem-region-id]').toArray()
      .filter(element => $(element).attr('data-oem-region-id') === regionId);
    if (matchingNodes.length !== 1) {
      addUnique(findings, finding('invalid-region-id', `Declared region ${regionId} must occur exactly once in the candidate body`, regionId));
    }
    if (PLATFORM_REGION.test(regionId)) {
      addUnique(findings, finding('platform-owned-region', `Platform-owned region ${regionId} cannot be published`, regionId));
    }
  }
  $('[data-oem-published-renderer]').each((_index, element) => {
    const regionId = ($(element).attr('data-oem-region-id') || '').trim();
    if (!regionId || !declared.has(regionId)) {
      addUnique(findings, finding('invalid-region-id', 'Every rendered publication region must match declared region metadata', regionId || undefined));
    }
  });
  $('[data-oem-region-role],[role],[data-compid]').each((_index, element) => {
    const role = $(element).attr('data-oem-region-role') || '';
    const semanticRole = $(element).attr('role') || '';
    const compid = $(element).attr('data-compid') || '';
    if (PLATFORM_ROLE.test(role) || PLATFORM_ROLE.test(semanticRole) || PLATFORM_COMPID.test(compid)) {
      const regionId = $(element).closest('[data-oem-region-id]').attr('data-oem-region-id');
      addUnique(findings, finding('platform-owned-region', 'Candidate body contains platform-owned hero, variants, or inventory markup', regionId));
    }
  });
  return findings;
}

async function validateIntegrity(candidate: ComposedPublicationCandidate): Promise<PublicationFinding[]> {
  const actualBytes = new TextEncoder().encode(candidate.body).byteLength;
  const referenceBytes = new TextEncoder().encode(candidate.referenceBody).byteLength;
  const actualSha256 = await sha256Hex(candidate.body);
  const expectedEtag = `"sha256-${actualSha256}"`;
  const findings: PublicationFinding[] = [];
  if (actualBytes > MAX_BODY_BYTES) {
    findings.push(finding('body-too-large', `Candidate body is ${actualBytes} bytes; maximum is ${MAX_BODY_BYTES}`));
  }
  if (referenceBytes > MAX_BODY_BYTES) {
    findings.push(finding('reference-body-too-large', `Reference body is ${referenceBytes} bytes; maximum is ${MAX_BODY_BYTES}`));
  }
  if (candidate.bytes !== actualBytes || candidate.sha256 !== actualSha256 || candidate.etag !== expectedEtag) {
    findings.push(finding('candidate-integrity', 'Candidate size, SHA-256, or ETag does not match its body'));
  }
  return findings;
}

export async function validatePublicationCandidate(
  candidate: ComposedPublicationCandidate,
  options: PublicationValidationOptions = {},
): Promise<PublicationValidationReport> {
  const blocking: PublicationFinding[] = [
    ...await validateMarkup('candidate', candidate.body, candidate.revision),
    ...await validateMarkup('reference', candidate.referenceBody, candidate.revision),
    ...validateRegions(candidate),
    ...await validateIntegrity(candidate),
  ];
  const warnings: PublicationFinding[] = candidate.warnings.map(message => finding('composition-warning', message));
  if (blocking.length) {
    const withoutDigest: Omit<PublicationValidationReport, 'digest'> = {
      publishable: false,
      blocking,
      warnings,
      viewports: [],
    };
    return { ...withoutDigest, digest: await validationDigest(withoutDigest) };
  }
  const browser = await validateInBrowser(candidate, options);
  blocking.push(...browser.blocking);
  warnings.push(...browser.warnings);
  const withoutDigest: Omit<PublicationValidationReport, 'digest'> = {
    publishable: blocking.length === 0,
    blocking,
    warnings,
    viewports: browser.viewports,
  };
  return { ...withoutDigest, digest: await validationDigest(withoutDigest) };
}
