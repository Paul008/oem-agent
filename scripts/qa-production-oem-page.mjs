#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages';

function readNext(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${arg} requires a value`);
  return value;
}

export function parseCliArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    json: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--slug') {
      options.slug = readNext(argv, index, arg);
      index++;
    } else if (arg === '--base-url') {
      options.baseUrl = readNext(argv, index, arg).replace(/\/+$/, '');
      index++;
    } else if (arg === '--html-url') {
      options.htmlUrl = readNext(argv, index, arg);
      index++;
    } else if (arg === '--manifest-url') {
      options.manifestUrl = readNext(argv, index, arg);
      index++;
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('--') && !options.slug) {
      options.slug = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.slug && (!options.htmlUrl || !options.manifestUrl))
    throw new Error('Provide a slug or both --html-url and --manifest-url');

  if (options.slug) {
    options.htmlUrl ||= `${options.baseUrl}/${encodeURIComponent(options.slug)}/production-html`;
    options.manifestUrl ||= `${options.baseUrl}/${encodeURIComponent(options.slug)}/production-manifest`;
  }

  return options;
}

function countMatches(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

function finding(severity, code, message) {
  return { severity, code, message };
}

function severityRank(severity) {
  return severity === 'critical' ? 3 : severity === 'warning' ? 2 : severity === 'info' ? 1 : 0;
}

export function analyzeProductionClone({ manifest, html, headers = {} }) {
  const findings = [];
  const scope = manifest?.scope || null;
  const selector = scope?.selector || '';
  const liveStylesheetLinks = countMatches(html, /<link\b(?=[^>]*\brel=["']?stylesheet\b)[^>]*>/gi);
  const blockedStylesheets = countMatches(html, /data-oem-blocked-stylesheet-href=/gi);
  const keyframeCorruption = selector
    ? countMatches(html, new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\d+%`, 'g'))
    : 0;

  if (manifest?.mode !== 'clone')
    findings.push(finding('critical', 'wrong-mode', `Expected manifest mode "clone", got "${manifest?.mode ?? 'missing'}"`));

  if (!selector)
    findings.push(finding('critical', 'missing-scope-manifest', 'Manifest is missing scope.selector'));

  if (!/class=["'][^"']*\boem-production-scope\b/i.test(html))
    findings.push(finding('critical', 'missing-scope-wrapper', 'Production HTML is missing the oem-production-scope wrapper'));

  if (liveStylesheetLinks > 0)
    findings.push(finding('critical', 'live-stylesheet-links', `${liveStylesheetLinks} live stylesheet link(s) remain in production HTML`));

  if ((scope?.external_stylesheets_blocked || 0) > 0 || blockedStylesheets > 0) {
    findings.push(finding(
      'critical',
      'blocked-stylesheets',
      `${scope?.external_stylesheets_blocked || blockedStylesheets} stylesheet(s) could not be scoped`,
    ));
  }

  if (keyframeCorruption > 0)
    findings.push(finding('critical', 'keyframe-corruption', `${keyframeCorruption} keyframe percentage selector(s) were incorrectly scoped`));

  if ((scope?.rules_scoped || 0) === 0)
    findings.push(finding('warning', 'no-rules-scoped', 'No CSS rules were scoped; verify this page actually has OEM CSS'));

  if (headers['x-oem-css-scope'] && headers['x-oem-css-scope'] !== selector)
    findings.push(finding('warning', 'scope-header-mismatch', 'X-OEM-CSS-Scope header does not match manifest scope.selector'));

  return {
    passed: !findings.some(item => item.severity === 'critical'),
    findings,
    stats: {
      slug: manifest?.slug || '',
      htmlBytes: Buffer.byteLength(html || ''),
      manifestBytes: manifest?.html_bytes || 0,
      styleTagsScoped: scope?.style_tags_scoped || 0,
      externalStylesheetsScoped: scope?.external_stylesheets_scoped || 0,
      externalStylesheetsBlocked: scope?.external_stylesheets_blocked || 0,
      rulesScoped: scope?.rules_scoped || 0,
      rulesSkipped: scope?.rules_skipped || 0,
      liveStylesheetLinks,
      blockedStylesheets,
      keyframeCorruption,
    },
  };
}

export function renderTextReport(result) {
  const lines = [
    `production clone QA: ${result.passed ? 'pass' : 'fail'}`,
    `slug: ${result.stats.slug || '(unknown)'}`,
    `html bytes: ${result.stats.htmlBytes}`,
    `stylesheets scoped: ${result.stats.externalStylesheetsScoped}`,
    `stylesheets blocked: ${result.stats.externalStylesheetsBlocked}`,
    `rules scoped: ${result.stats.rulesScoped}`,
    `live stylesheet links: ${result.stats.liveStylesheetLinks}`,
    `keyframe corruption: ${result.stats.keyframeCorruption}`,
  ];

  if (result.findings.length > 0) {
    lines.push('', 'findings:');
    for (const item of result.findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)))
      lines.push(`- ${item.severity}: ${item.code} - ${item.message}`);
  }

  return lines.join('\n');
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`GET ${url} failed: ${response.status}`);
  return response.json();
}

async function fetchTextWithHeaders(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`GET ${url} failed: ${response.status}`);

  const headers = {};
  for (const [key, value] of response.headers.entries())
    headers[key.toLowerCase()] = value;

  return { text: await response.text(), headers };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const [manifest, htmlResponse] = await Promise.all([
    fetchJson(options.manifestUrl),
    fetchTextWithHeaders(options.htmlUrl),
  ]);
  const result = analyzeProductionClone({
    manifest,
    html: htmlResponse.text,
    headers: htmlResponse.headers,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderTextReport(result));
  }

  if (!result.passed)
    process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
