#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_WEBBRIDGE_COMMAND_URL = 'http://127.0.0.1:10086/command';
const DEFAULT_DASHBOARD_ORIGIN = 'https://oem-dashboard.pages.dev';
const DEFAULT_SESSION = 'clone-studio-audit';

export const CLONE_STUDIO_SHIM_CSS = [
  'html,body{max-width:100%;overflow-x:clip!important}',
  '.animated,.animate__animated,.wow,.aos-init,[data-aos],[class*="fadeIn"]{opacity:1!important;visibility:visible!important;transform:none!important}',
  '.slick-list,.swiper,.swiper-container,.swiper-wrapper,.splide,.splide__track,.splide__list,.carousel,.carousel-inner,[class*="swiper"],[class*="carousel"],[class*="slider"]{max-width:100%!important;overflow:hidden!important}',
  '.slick-track,.swiper-wrapper,.splide__list,.carousel-inner{width:100%!important;max-width:100%!important;transform:none!important}',
  '.slick-slide,.swiper-slide,.splide__slide,.carousel-item{width:100%!important;max-width:100%!important;flex-shrink:0!important}',
  '@media (min-width:1024px){img,picture,video,canvas,svg{max-width:100%!important}img,video{height:auto!important}}',
].join('');

export function buildAuditEvaluateCode(options = {}) {
  const injectShim = options.injectShim !== false;
  const settleMs = Number.isFinite(options.settleMs) ? Number(options.settleMs) : 3500;

  return `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<100;i++){const f=document.querySelector('iframe[title="Clone Studio canvas"]');if(f&&f.getAttribute("srcdoc")&&f.getAttribute("srcdoc").length>1000)break;await wait(200)}const f=document.querySelector('iframe[title="Clone Studio canvas"]');if(!f)return JSON.stringify({found:false,url:location.href,text:document.body.innerText.slice(0,1000)});const src=f.getAttribute("srcdoc")||"";const initialSandbox=f.getAttribute("sandbox");f.setAttribute("sandbox","allow-scripts allow-same-origin");const loaded=new Promise(r=>f.addEventListener("load",r,{once:true}));f.srcdoc=src;await Promise.race([loaded,wait(5000)]);await wait(${settleMs});const d=f.contentDocument,w=f.contentWindow;function audit(){const imgs=[...d.querySelectorAll("img")];const hidden=[];[...d.querySelectorAll("section,div,p,span")].forEach(e=>{const c=w.getComputedStyle(e);const text=(e.textContent||"").trim().replace(/\\s+/g," ");if((c.display==="none"||parseFloat(c.opacity)===0||c.visibility==="hidden")&&text.length>40)hidden.push({tag:e.tagName.toLowerCase(),cls:String(e.className),text:text.slice(0,90),display:c.display,opacity:c.opacity,visibility:c.visibility})});const root=d.documentElement;const offenders=[...d.querySelectorAll("body *")].map(e=>{const r=e.getBoundingClientRect();return{tag:e.tagName.toLowerCase(),cls:String(e.className),width:Math.round(r.width),left:Math.round(r.left),right:Math.round(r.right),overflow:Math.round(Math.max(0,r.right-root.clientWidth))}}).filter(x=>x.overflow>8).sort((a,b)=>b.overflow-a.overflow).slice(0,5);const broken=imgs.filter(i=>!(i.complete&&i.naturalWidth>0));return{imgs:imgs.length,broken:broken.length,brokenSamples:broken.slice(0,5).map(i=>i.currentSrc||i.src||i.getAttribute("src")||i.getAttribute("data-src")||""),stylesheets:d.styleSheets.length,links:d.querySelectorAll("link[rel=stylesheet]").length,fonts:d.fonts?d.fonts.size:null,hiddenTextBlocks:hidden.length,hiddenSamples:hidden.slice(0,5),innerWidth:root.clientWidth,scrollWidth:root.scrollWidth,overflow:Math.max(0,root.scrollWidth-root.clientWidth),overflowOffenders:offenders,htmlOverflowX:w.getComputedStyle(root).overflowX,bodyOverflowX:w.getComputedStyle(d.body).overflowX}}const before=audit();let after=null;if(${injectShim ? 'true' : 'false'}){const style=d.createElement("style");style.textContent=${JSON.stringify(CLONE_STUDIO_SHIM_CSS)};d.head.appendChild(style);await wait(100);after=audit()}return JSON.stringify({found:true,url:location.href,initialSandbox,srcdocBytes:src.length,before,after})})()`;
}

function metricSummary(metric = {}) {
  return [
    `imgs=${metric.imgs ?? '-'}`,
    `broken=${metric.broken ?? '-'}`,
    `sheets=${metric.stylesheets ?? '-'}/${metric.links ?? '-'}`,
    `fonts=${metric.fonts ?? '-'}`,
    `hidden=${metric.hiddenTextBlocks ?? '-'}`,
    `overflow=${metric.overflow ?? '-'}`,
  ].join(' ');
}

export function summarizeAuditResult(slug, result) {
  return {
    slug,
    before: metricSummary(result.before),
    after: result.after ? metricSummary(result.after) : 'not run',
  };
}

async function webbridgeCommand(action, args, session, commandUrl) {
  const response = await fetch(commandUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args, session }),
  });
  const json = await response.json();
  if (!json.ok)
    throw new Error(JSON.stringify(json));
  return json.data;
}

export async function auditCloneStudioPages(slugs, options = {}) {
  const session = options.session || DEFAULT_SESSION;
  const origin = options.origin || DEFAULT_DASHBOARD_ORIGIN;
  const commandUrl = options.commandUrl || process.env.KIMI_WEBBRIDGE_COMMAND_URL || DEFAULT_WEBBRIDGE_COMMAND_URL;
  const code = buildAuditEvaluateCode({
    injectShim: options.injectShim !== false,
    settleMs: options.settleMs,
  });
  const results = [];

  try {
    for (const [index, slug] of slugs.entries()) {
      await webbridgeCommand('navigate', {
        url: `${origin}/dashboard/page-builder/${slug}`,
        newTab: index === 0,
        group_title: 'Clone Studio Audit',
      }, session, commandUrl);
      const evaluated = await webbridgeCommand('evaluate', { code }, session, commandUrl);
      const parsed = JSON.parse(evaluated.value);
      results.push({ slug, ...parsed });
    }
    return results;
  } finally {
    await webbridgeCommand('close_session', {}, session, commandUrl).catch(() => null);
  }
}

function parseCliArgs(argv) {
  const options = {
    session: DEFAULT_SESSION,
    origin: DEFAULT_DASHBOARD_ORIGIN,
    injectShim: true,
    json: false,
    settleMs: 3500,
  };
  const slugs = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--session') {
      options.session = argv[++index];
    } else if (arg === '--origin') {
      options.origin = argv[++index];
    } else if (arg === '--settle-ms') {
      options.settleMs = Number(argv[++index]);
    } else if (arg === '--no-shim') {
      options.injectShim = false;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      slugs.push(arg);
    }
  }

  return { options, slugs };
}

function printUsage() {
  console.error('Usage: node scripts/clone-studio-audit.mjs [--json] [--no-shim] [--session name] [--origin url] <page-builder-slug>...');
  console.error('Example: node scripts/clone-studio-audit.mjs kia-au-sportage gwm-au-haval-h6');
}

async function main() {
  const { options, slugs } = parseCliArgs(process.argv.slice(2));
  if (slugs.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const results = await auditCloneStudioPages(slugs, options);
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const result of results) {
    const summary = summarizeAuditResult(result.slug, result);
    console.log(`${summary.slug}\tbefore: ${summary.before}\tafter: ${summary.after}`);
  }
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
