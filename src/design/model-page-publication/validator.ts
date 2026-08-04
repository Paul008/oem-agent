import { load } from 'cheerio';
import postcss from 'postcss';

import {
  PUBLICATION_ALPINE_RUNTIME_SCRIPT,
  PUBLICATION_INTERACTION_SCRIPT,
  PUBLICATION_SCRIPT_MARKERS,
  isPublicationResizeScript,
  type ComposedPublicationCandidate,
} from './composer';
import {
  validateInBrowser,
  type BrowserValidationOptions,
  type PublicationFinding,
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

const MAX_BODY_BYTES = 5_242_880;
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
      if (['import', 'namespace', 'document', 'font-face', 'property', 'counter-style', 'page'].includes(rule.name.toLowerCase())) safe = false;
    });
    root.walkDecls(declaration => {
      if (declaration.parent?.type === 'root') safe = false;
    });
    root.walkRules(rule => {
      let parent = rule.parent;
      while (parent && parent.type !== 'root') {
        if (parent.type === 'atrule' && /^(?:-webkit-)?keyframes$/i.test(parent.name)) return;
        parent = parent.parent;
      }
      if (!rule.selectors.every(selector => selector.trim().startsWith('[data-oem-publication-body="true"]'))) safe = false;
    });
    return safe;
  } catch {
    return false;
  }
}

async function validateTrustedScripts(label: 'candidate' | 'reference', $: ReturnType<typeof load>): Promise<PublicationFinding[]> {
  const scripts = $('script').toArray();
  const markerEntries = [
    { marker: PUBLICATION_SCRIPT_MARKERS.alpine, valid: (body: string) => body === PUBLICATION_ALPINE_RUNTIME_SCRIPT },
    { marker: PUBLICATION_SCRIPT_MARKERS.resize, valid: isPublicationResizeScript },
    { marker: PUBLICATION_SCRIPT_MARKERS.interactions, valid: (body: string) => body === PUBLICATION_INTERACTION_SCRIPT },
  ];
  const bodies: string[] = [];
  let trusted = scripts.length === markerEntries.length;
  for (const entry of markerEntries) {
    const matches = scripts.filter(script => $(script).attr(entry.marker) === 'true');
    if (matches.length !== 1) {
      trusted = false;
      continue;
    }
    const script = matches[0];
    const attributes = Object.keys((script as { attribs?: Record<string, string> }).attribs || {});
    const body = $(script).text();
    if (attributes.length !== 1 || $(script).attr('src') || !entry.valid(body)) trusted = false;
    bodies.push(body);
  }

  const cspMetas = $('meta').toArray().filter(meta => ($(meta).attr('http-equiv') || '').toLowerCase() === 'content-security-policy');
  if (cspMetas.length !== 1) trusted = false;
  const csp = cspMetas.length === 1 ? $(cspMetas[0]).attr('content') || '' : '';
  const scriptDirective = csp.split(';').map(item => item.trim()).find(item => /^script-src(?:\s|$)/i.test(item));
  const tokens = scriptDirective?.split(/\s+/).slice(1) || [];
  const expectedTokens = bodies.length === 3
    ? await Promise.all(bodies.map(async body => `'sha256-${await sha256Base64(body)}'`))
    : [];
  if (tokens.length !== 3
    || [...tokens].sort().join(' ') !== [...expectedTokens].sort().join(' ')) trusted = false;
  return trusted ? [] : [finding('unsafe-script', `${label} body does not contain the exact composer-owned scripts and CSP hashes`)];
}

async function validateMarkup(label: 'candidate' | 'reference', html: string): Promise<PublicationFinding[]> {
  const findings: PublicationFinding[] = [];
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
  $('body style').each((_index, element) => {
    if (!styleIsScoped($(element).text())) {
      addUnique(findings, finding('unscoped-style', `${label} body contains a style block outside the publication scope`));
    }
  });
  findings.push(...await validateTrustedScripts(label, $));
  return findings;
}

function validateRegions(candidate: ComposedPublicationCandidate): PublicationFinding[] {
  const findings: PublicationFinding[] = [];
  const $ = load(candidate.body);
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
    ...await validateMarkup('candidate', candidate.body),
    ...await validateMarkup('reference', candidate.referenceBody),
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
