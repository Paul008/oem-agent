/**
 * banner-triage.ts
 *
 * Core 5-layer banner discovery cascade for the Banner Triage Agent.
 *
 * Layer 1: Discovered APIs — query known JSON endpoints from the DB
 * Layer 2: Network Interception — skipped (requires CF Browser runtime)
 * Layer 3: Inline Data Extraction — JSON-LD, __NEXT_DATA__, Nuxt, AEM, window globals
 * Layer 4: AI Selector Discovery — LLM-guided CSS selector discovery via cheerio validation
 * Layer 5: Escalation — Slack alert when confidence < 0.7 after all layers
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OemId, ExtractedBannerSlide } from '../oem/types';
import { getOemDefinition } from '../oem/registry';
import {
  isBannerData,
  normaliseBannerData,
  scoreBannerConfidence,
} from '../extract/banner-data-filter';
import { extractInlineData } from '../extract/inline-data';

// ============================================================================
// Types
// ============================================================================

export interface TriageResult {
  success: boolean;
  confidence: number;
  layer_used: number | null;
  banners_found: number;
  actions_taken: string[];
  reasoning: string;
  layer_results: Record<string, { status: string; confidence: number; detail?: string }>;
  execution_time_ms: number;
  cost_usd: number;
}

interface TriageContext {
  oemId: OemId;
  pageUrl: string;
  previousBannerCount: number;
  oldSelector: string | null;
  supabase: SupabaseClient;
  slackWebhookUrl?: string;
  aiRouter?: { route: (req: any) => Promise<any> };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Returns true only for HTTPS URLs pointing to public internet hosts.
 * Blocks localhost, private IP ranges, link-local, and .internal/.local TLDs.
 */
function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') ||
        host.startsWith('10.') || host.startsWith('172.') || host.startsWith('169.254.') ||
        host.endsWith('.internal') || host.endsWith('.local')) return false;
    return true;
  } catch { return false; }
}

/**
 * Recursively searches an object up to `depth` levels for arrays of 2+ objects
 * that have both image-like and text-like keys — i.e. banner arrays.
 */
function findBannerArrayInObject(obj: unknown, depth = 0): Record<string, unknown>[] | null {
  if (depth > 3 || obj === null || typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    if (obj.length >= 2 && obj.every(item => item !== null && typeof item === 'object')) {
      const items = obj as Record<string, unknown>[];
      const IMAGE_KEYS = ['image', 'imageUrl', 'image_url', 'img', 'src', 'photo', 'media', 'banner', 'visual'];
      const TEXT_KEYS  = ['title', 'heading', 'headline', 'name', 'text', 'alt'];

      const hasImageKey = (item: Record<string, unknown>) =>
        Object.keys(item).some(k => IMAGE_KEYS.some(ik => k.toLowerCase() === ik));
      const hasTextKey = (item: Record<string, unknown>) =>
        Object.keys(item).some(k => TEXT_KEYS.some(tk => k.toLowerCase() === tk));

      if (items.every(item => hasImageKey(item) && hasTextKey(item))) {
        return items;
      }
    }
    // Search inside array elements
    for (const elem of obj) {
      const found = findBannerArrayInObject(elem, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // Plain object — search values
  for (const value of Object.values(obj as Record<string, unknown>)) {
    const found = findBannerArrayInObject(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Strips noisy markup from HTML to produce a compact representation for LLM
 * consumption. Extracts <main> or the first 5 <section> elements, strips
 * scripts/styles/SVGs/data-* attributes, and truncates to 8K chars.
 */
function cleanHtmlForLlm(html: string): string {
  // Try to extract <main> first, otherwise first 5 sections
  let body = html;

  const mainMatch = /<main[\s\S]*?<\/main>/i.exec(html);
  if (mainMatch) {
    body = mainMatch[0];
  } else {
    const sectionMatches: string[] = [];
    const sectionRe = /<section[\s\S]*?<\/section>/gi;
    let m: RegExpExecArray | null;
    while ((m = sectionRe.exec(html)) !== null && sectionMatches.length < 5) {
      sectionMatches.push(m[0]);
    }
    if (sectionMatches.length > 0) {
      body = sectionMatches.join('\n');
    }
  }

  // Strip <style>, <script>, <svg> blocks
  body = body.replace(/<style[\s\S]*?<\/style>/gi, '');
  body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
  body = body.replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // Strip data-emotion-*, data-testid attributes
  body = body.replace(/\s+data-emotion[^\s>]*(="[^"]*")?/g, '');
  body = body.replace(/\s+data-testid="[^"]*"/g, '');
  body = body.replace(/\s+data-[^\s>]*(="[^"]*")?/g, '');

  // Collapse whitespace
  body = body.replace(/\s{2,}/g, ' ').trim();

  // Truncate to 8K characters
  if (body.length > 8000) {
    body = body.slice(0, 8000) + '…';
  }

  return body;
}

/**
 * Upserts a single banner slide to the `banners` table.
 * Matches on (oem_id, page_url, position).
 */
async function upsertBanner(
  supabase: SupabaseClient,
  oemId: OemId,
  pageUrl: string,
  slide: ExtractedBannerSlide,
): Promise<void> {
  await supabase.from('banners').upsert(
    {
      oem_id: oemId,
      page_url: pageUrl,
      position: slide.position,
      headline: slide.headline ?? null,
      sub_headline: slide.sub_headline ?? null,
      cta_text: slide.cta_text ?? null,
      cta_url: slide.cta_url ?? null,
      image_url_desktop: slide.image_url_desktop,
      image_url_mobile: slide.image_url_mobile ?? null,
      disclaimer_text: slide.disclaimer_text ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'oem_id,page_url,position' },
  );
}

// ============================================================================
// Main Orchestrator
// ============================================================================

export async function executeBannerTriage(ctx: TriageContext): Promise<TriageResult> {
  const startTime = Date.now();
  const {
    oemId, pageUrl, previousBannerCount, supabase, slackWebhookUrl, aiRouter,
  } = ctx;

  const actions: string[] = [];
  const layerResults: TriageResult['layer_results'] = {};

  let bestBanners: ExtractedBannerSlide[] = [];
  let bestConfidence = 0;
  let bestLayer: number | null = null;
  let costUsd = 0;
  let cachedHtml: string | null = null; // reuse across layers 3 & 4

  const oemDef = getOemDefinition(oemId);

  // --------------------------------------------------------------------------
  // Layer 1: Discovered APIs
  // --------------------------------------------------------------------------
  try {
    const { data: apis } = await supabase
      .from('discovered_apis')
      .select('url, method, data_type, confidence')
      .eq('oem_id', oemId)
      .in('data_type', ['banners', 'hero', 'carousel', 'homepage'])
      .gte('confidence', 0.5);

    if (!apis || apis.length === 0) {
      layerResults['layer_1_discovered_apis'] = { status: 'no_apis', confidence: 0, detail: 'No qualifying discovered APIs in DB' };
    } else {
      let layer1Success = false;

      for (const api of apis) {
        try {
          if (!isAllowedUrl(api.url)) continue;
          const method = (api.method ?? 'GET').toUpperCase();
          const res = await fetch(api.url, { method });
          if (!res.ok) continue;

          const body = await res.json().catch(() => null);
          if (body === null) continue;

          if (!isBannerData(api.url, body)) continue;

          // Unwrap top-level array or search one level deep
          let items: Record<string, unknown>[];
          if (Array.isArray(body)) {
            items = body as Record<string, unknown>[];
          } else {
            const found = findBannerArrayInObject(body, 0);
            if (!found) continue;
            items = found;
          }

          const normalised = normaliseBannerData(items);
          const confidence = scoreBannerConfidence(normalised, 0.95, previousBannerCount);

          if (confidence > bestConfidence) {
            bestBanners = normalised;
            bestConfidence = confidence;
            bestLayer = 1;
          }
          layer1Success = true;

          actions.push(`layer_1: matched API ${api.url} (confidence=${confidence.toFixed(2)})`);
          layerResults['layer_1_discovered_apis'] = {
            status: 'success',
            confidence,
            detail: `${normalised.length} banners from ${api.url}`,
          };
          break; // use first successful API
        } catch {
          // continue to next API
        }
      }

      if (!layer1Success && !layerResults['layer_1_discovered_apis']) {
        layerResults['layer_1_discovered_apis'] = {
          status: 'no_match',
          confidence: 0,
          detail: `Tried ${apis.length} API(s), none matched banner shape`,
        };
      }
    }
  } catch (err: any) {
    layerResults['layer_1_discovered_apis'] = {
      status: 'error',
      confidence: 0,
      detail: String(err?.message ?? err),
    };
  }

  // --------------------------------------------------------------------------
  // Layer 2: Network Interception (skipped — requires CF Browser runtime)
  // --------------------------------------------------------------------------
  layerResults['layer_2_network_interception'] = {
    status: 'skipped',
    confidence: 0,
    detail: 'Requires CF Browser runtime',
  };

  // --------------------------------------------------------------------------
  // Layer 3: Inline Data Extraction
  // --------------------------------------------------------------------------
  if (bestConfidence < 1) {
    try {
      if (!isAllowedUrl(pageUrl)) {
        layerResults['layer_3_inline_data'] = {
          status: 'error',
          confidence: 0,
          detail: `Blocked URL (SSRF protection): ${pageUrl}`,
        };
      } else {
        const pageRes = await fetch(pageUrl);
        if (pageRes.ok) {
          cachedHtml = await pageRes.text();

          if (oemDef) {
            const inlineResults = await extractInlineData(cachedHtml, oemDef, pageUrl);

            let layer3BestConf = 0;
            let layer3Detail = `${inlineResults.length} inline source(s) found`;

            for (const result of inlineResults) {
              let items: Record<string, unknown>[] | null = null;

              // Direct array of banner slides
              if (Array.isArray(result.data) && result.data.length >= 2) {
                items = result.data as Record<string, unknown>[];
              } else {
                items = findBannerArrayInObject(result.data, 0);
              }

              if (!items || items.length === 0) continue;

              const normalised = normaliseBannerData(items);
              const confidence = scoreBannerConfidence(normalised, result.confidence, previousBannerCount);

              if (confidence > layer3BestConf) {
                layer3BestConf = confidence;
                layer3Detail = `${normalised.length} banners from ${result.source} (base=${result.confidence.toFixed(2)})`;
              }

              if (confidence > bestConfidence) {
                bestBanners = normalised;
                bestConfidence = confidence;
                bestLayer = 3;
                actions.push(`layer_3: extracted ${normalised.length} banners from ${result.source} (confidence=${confidence.toFixed(2)})`);
              }
            }

            layerResults['layer_3_inline_data'] = {
              status: layer3BestConf > 0 ? 'success' : 'no_match',
              confidence: layer3BestConf,
              detail: layer3Detail,
            };
          } else {
            layerResults['layer_3_inline_data'] = {
              status: 'skipped',
              confidence: 0,
              detail: `No OEM definition found for ${oemId}`,
            };
          }
        } else {
          layerResults['layer_3_inline_data'] = {
            status: 'error',
            confidence: 0,
            detail: `Page fetch failed: HTTP ${pageRes.status}`,
          };
        }
      }
    } catch (err: any) {
      layerResults['layer_3_inline_data'] = {
        status: 'error',
        confidence: 0,
        detail: String(err?.message ?? err),
      };
    }
  } else {
    layerResults['layer_3_inline_data'] = {
      status: 'skipped',
      confidence: bestConfidence,
      detail: 'Skipped — sufficient confidence already achieved',
    };
  }

  // --------------------------------------------------------------------------
  // Layer 4: AI Selector Discovery
  // --------------------------------------------------------------------------
  if (bestConfidence < 0.7 && aiRouter) {
    costUsd += 0.005;
    try {
      // Fetch HTML if not already cached
      if (!cachedHtml) {
        if (!isAllowedUrl(pageUrl)) {
          layerResults['layer_4_ai_selector'] = {
            status: 'error',
            confidence: 0,
            detail: `Blocked URL (SSRF protection): ${pageUrl}`,
          };
        } else {
          const pageRes = await fetch(pageUrl);
          if (pageRes.ok) {
            cachedHtml = await pageRes.text();
          }
        }
      }

      if (cachedHtml) {
        const cleanedHtml = cleanHtmlForLlm(cachedHtml);

        const prompt = `You are analysing a car manufacturer homepage to find the banner/hero slideshow.

HTML (truncated):
${cleanedHtml}

Return a JSON object with these fields:
- container_selector: CSS selector for the outer slider/carousel container
- headline_selector: CSS selector for the slide headline text (relative to each slide)
- headline_from_alt: boolean — if true, use the img alt attribute as the headline instead
- image_selector: CSS selector for the slide image (relative to each slide)
- cta_selector: CSS selector for the call-to-action link/button (relative to each slide)
- confidence: number 0–1 indicating your confidence
- reasoning: short explanation
- slide_count: estimated number of slides visible

Respond ONLY with the JSON object, no markdown fencing.`;

        const llmResponse = await aiRouter.route({
          taskType: 'llm_extraction',
          prompt,
          responseFormat: 'json',
        });

        // Parse LLM response
        let discovered: any = null;
        try {
          discovered = typeof llmResponse === 'string'
            ? JSON.parse(llmResponse)
            : llmResponse;
        } catch {
          layerResults['layer_4_ai_selector'] = {
            status: 'error',
            confidence: 0,
            detail: 'LLM returned unparseable response',
          };
        }

        if (discovered && discovered.container_selector) {
          // Validate selectors against HTML with cheerio
          const cheerio = await import('cheerio');
          const $ = cheerio.load(cachedHtml);

          const containerMatches = $(discovered.container_selector);
          const isValid = containerMatches.length >= 2;

          if (isValid) {
            // Extract banners using discovered selectors
            const slides: ExtractedBannerSlide[] = [];
            containerMatches.each((i, el) => {
              const container = $(el);

              let headline: string | null = null;
              if (discovered.headline_from_alt && discovered.image_selector) {
                headline = container.find(discovered.image_selector).first().attr('alt') ?? null;
              } else if (discovered.headline_selector) {
                headline = container.find(discovered.headline_selector).first().text().trim() || null;
              }

              const imageEl = discovered.image_selector
                ? container.find(discovered.image_selector).first()
                : null;
              const image_url_desktop =
                (imageEl?.attr('src') ?? imageEl?.attr('data-src') ?? imageEl?.attr('srcset')?.split(' ')[0]) ?? '';

              const ctaEl = discovered.cta_selector
                ? container.find(discovered.cta_selector).first()
                : null;
              const cta_url = ctaEl?.attr('href') ?? null;
              const cta_text = ctaEl?.text().trim() || null;

              slides.push({
                position: i,
                headline,
                sub_headline: null,
                cta_text,
                cta_url,
                image_url_desktop,
                image_url_mobile: null,
                disclaimer_text: null,
              });
            });

            const confidence = scoreBannerConfidence(slides, discovered.confidence ?? 0.7, previousBannerCount);

            // Persist selector override to DB
            await supabase.from('selector_overrides').upsert(
              {
                oem_id: oemId,
                page_type: 'homepage',
                selector_type: 'heroSlides',
                selector_value: discovered.container_selector,
                metadata: {
                  headline_selector: discovered.headline_selector ?? null,
                  headline_from_alt: discovered.headline_from_alt ?? false,
                  image_selector: discovered.image_selector ?? null,
                  cta_selector: discovered.cta_selector ?? null,
                  reasoning: discovered.reasoning ?? null,
                  slide_count: discovered.slide_count ?? null,
                },
                confidence,
                discovered_by: 'ai_triage',
                validated_at: new Date().toISOString(),
                expires_at: null,
              },
              { onConflict: 'oem_id,page_type,selector_type' },
            );

            actions.push(`layer_4: AI discovered selector "${discovered.container_selector}" (confidence=${confidence.toFixed(2)})`);

            if (confidence > bestConfidence) {
              bestBanners = slides;
              bestConfidence = confidence;
              bestLayer = 4;
            }

            layerResults['layer_4_ai_selector'] = {
              status: 'success',
              confidence,
              detail: `Selector: ${discovered.container_selector}, slides: ${slides.length}`,
            };
          } else {
            layerResults['layer_4_ai_selector'] = {
              status: 'invalid',
              confidence: 0,
              detail: `Selector "${discovered.container_selector}" matched ${containerMatches.length} element(s) — need ≥2`,
            };
          }
        } else if (!layerResults['layer_4_ai_selector']) {
          layerResults['layer_4_ai_selector'] = {
            status: 'no_selector',
            confidence: 0,
            detail: 'LLM did not return a usable container_selector',
          };
        }
      } else {
        layerResults['layer_4_ai_selector'] = {
          status: 'error',
          confidence: 0,
          detail: 'Could not fetch page HTML for AI analysis',
        };
      }
    } catch (err: any) {
      layerResults['layer_4_ai_selector'] = {
        status: 'error',
        confidence: 0,
        detail: String(err?.message ?? err),
      };
    }
  } else {
    layerResults['layer_4_ai_selector'] = {
      status: 'skipped',
      confidence: bestConfidence,
      detail: bestConfidence >= 0.7
        ? 'Skipped — sufficient confidence already achieved'
        : 'Skipped — no aiRouter provided',
    };
  }

  // --------------------------------------------------------------------------
  // Layer 5: Escalation
  // --------------------------------------------------------------------------
  if (bestConfidence < 0.7) {
    const diagnosis = Object.entries(layerResults)
      .map(([layer, res]) => `• ${layer}: ${res.status} (conf=${res.confidence.toFixed(2)})${res.detail ? ' — ' + res.detail : ''}`)
      .join('\n');

    const message = {
      text: `*Banner Triage Escalation* — \`${oemId}\`\nPage: ${pageUrl}\nBest confidence after all layers: *${bestConfidence.toFixed(2)}*\n\n${diagnosis}`,
    };

    if (slackWebhookUrl) {
      try {
        await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
        actions.push('layer_5: Slack escalation sent');
        layerResults['layer_5_escalation'] = {
          status: 'sent',
          confidence: 0,
          detail: 'Slack webhook notified',
        };
      } catch (err: any) {
        layerResults['layer_5_escalation'] = {
          status: 'error',
          confidence: 0,
          detail: `Slack send failed: ${err?.message ?? err}`,
        };
      }
    } else {
      layerResults['layer_5_escalation'] = {
        status: 'no_webhook',
        confidence: 0,
        detail: 'No slackWebhookUrl configured — escalation skipped',
      };
    }
  } else {
    layerResults['layer_5_escalation'] = {
      status: 'not_needed',
      confidence: bestConfidence,
      detail: 'Confidence threshold met — no escalation required',
    };
  }

  // --------------------------------------------------------------------------
  // Persist banners if confidence threshold met
  // --------------------------------------------------------------------------
  if (bestConfidence >= 0.7 && bestBanners.length > 0) {
    let upserted = 0;
    for (const slide of bestBanners) {
      try {
        await upsertBanner(supabase, oemId, pageUrl, slide);
        upserted++;
      } catch (err) {
        console.error(`[BannerTriage] Failed to upsert banner ${slide.position} for ${ctx.oemId}:`, err);
      }
    }
    actions.push(`upserted ${upserted}/${bestBanners.length} banners to DB`);
  }

  const executionTimeMs = Date.now() - startTime;
  const success = bestConfidence >= 0.7;

  return {
    success,
    confidence: bestConfidence,
    layer_used: bestLayer,
    banners_found: bestBanners.length,
    actions_taken: actions,
    reasoning: success
      ? `Banner triage succeeded via layer ${bestLayer} with confidence ${bestConfidence.toFixed(2)}`
      : `All layers exhausted; best confidence was ${bestConfidence.toFixed(2)} — escalation triggered`,
    layer_results: layerResults,
    execution_time_ms: executionTimeMs,
    cost_usd: costUsd,
  };
}
