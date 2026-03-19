/**
 * PDF Vectorization Pipeline
 *
 * Downloads brochure and guidelines PDFs, extracts text, chunks it,
 * generates embeddings via Google gemini-embedding-001, and upserts
 * into the pdf_embeddings table.
 *
 * Requires: GOOGLE_API_KEY env var
 * Run: cd dashboard/scripts && node vectorize-pdfs.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')
async function pdf(buffer) {
  const parser = new PDFParse(new Uint8Array(buffer))
  await parser.load()
  const info = await parser.getInfo()
  const pages = []
  for (let i = 1; i <= (info.numPages || 50); i++) {
    try { pages.push(await parser.getPageText(i)) } catch { break }
  }
  return { numpages: info.numPages || pages.length, text: pages.join('\n') }
}
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://nnihmdmsglkxpmilmjjc.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

if (!GOOGLE_API_KEY) {
  console.error('ERROR: GOOGLE_API_KEY env var is required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 200
const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 768
const BATCH_DELAY_MS = 250 // delay between embedding API calls to avoid rate limits
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// ── Temp directory ──────────────────────────────────────────────────────────
const TMP_DIR = join(tmpdir(), 'vectorize-pdfs')
await mkdir(TMP_DIR, { recursive: true })

// ── Summary counters ────────────────────────────────────────────────────────
const summary = {
  brochuresFound: 0,
  guidelinesFound: 0,
  pdfsDownloaded: 0,
  pdfsFailedDownload: 0,
  pdfsFailedParse: 0,
  chunksCreated: 0,
  embeddingsGenerated: 0,
  embeddingsUpserted: 0,
  embeddingsFailed: 0,
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Download a PDF from a URL to a temp file and return the buffer.
 */
async function downloadPdf(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('pdf') && !url.endsWith('.pdf')) {
    throw new Error(`Not a PDF (content-type: ${contentType})`)
  }
  const arrayBuf = await res.arrayBuffer()
  return Buffer.from(arrayBuf)
}

/**
 * Extract text from a PDF buffer via Gemini 2.5 Flash vision.
 * Handles both text-based and image-based PDFs natively.
 * Falls back to pdf-parse for very large files (>40MB Gemini limit).
 */
async function extractText(buffer) {
  // Validate it's actually a PDF
  if (!Buffer.from(buffer).slice(0, 5).toString().startsWith('%PDF')) {
    console.log('    → Not a valid PDF (HTML redirect or error page)')
    return ''
  }

  // Gemini has a ~20MB inline limit — use it for most brochures
  if (buffer.length > 20 * 1024 * 1024) {
    console.log('    → PDF too large for Gemini inline (' + Math.round(buffer.length / 1024 / 1024) + 'MB), trying pdf-parse...')
    try {
      const result = await pdf(buffer)
      return result.text || ''
    } catch { return '' }
  }

  // Use Gemini 2.5 Flash for native PDF understanding
  try {
    const base64 = Buffer.from(buffer).toString('base64')
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: base64 } },
              { text: 'Extract ALL text content from this automotive PDF document. Include every heading, paragraph, specification, feature, price, disclaimer, and footnote. Output plain text only, preserving the document structure with line breaks between sections. Do not summarize — extract everything verbatim.' },
            ],
          }],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      }
    )
    if (!res.ok) {
      const err = await res.text()
      console.log('    → Gemini error:', res.status, err.slice(0, 100))
      return ''
    }
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (text.length > 0) console.log('    → Gemini extracted', text.length, 'chars')
    return text
  } catch (e) {
    console.log('    → Gemini extraction failed:', e.message)
    return ''
  }
}

/**
 * Split text into overlapping chunks.
 */
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = []
  if (!text || text.length === 0) return chunks

  // Clean up excessive whitespace but preserve paragraph breaks
  const cleaned = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim()
  if (cleaned.length === 0) return chunks

  let start = 0
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length)
    const chunk = cleaned.slice(start, end).trim()
    if (chunk.length > 0) {
      chunks.push(chunk)
    }
    if (end >= cleaned.length) break
    start = end - overlap
  }
  return chunks
}

/**
 * Generate an embedding for a text chunk via Google gemini-embedding-001.
 */
async function generateEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GOOGLE_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Embedding API ${res.status}: ${errBody}`)
  }
  const data = await res.json()
  return data.embedding.values
}

/**
 * Upsert a chunk embedding into pdf_embeddings.
 * Uses the unique constraint on (source_id, source_type, chunk_index).
 */
async function upsertChunkEmbedding({ sourceType, sourceId, oemId, pdfUrl, chunkIndex, chunkText, embedding, metadata }) {
  const { error } = await supabase
    .from('pdf_embeddings')
    .upsert(
      {
        source_type: sourceType,
        source_id: sourceId,
        oem_id: oemId,
        pdf_url: pdfUrl,
        chunk_index: chunkIndex,
        chunk_text: chunkText,
        embedding: `[${embedding.join(',')}]`,
        metadata: metadata || {},
      },
      { onConflict: 'source_id,source_type,chunk_index' }
    )
  if (error) {
    throw new Error(`Upsert error: ${error.message}`)
  }
}

/**
 * Process a single PDF: download, extract, chunk, embed, upsert.
 */
async function processPdf({ sourceType, sourceId, oemId, pdfUrl, label }) {
  console.log(`\n  [${label}] ${pdfUrl}`)

  // 1. Download
  let buffer
  try {
    buffer = await downloadPdf(pdfUrl)
    summary.pdfsDownloaded++
    console.log(`    Downloaded: ${(buffer.length / 1024).toFixed(0)} KB`)
  } catch (err) {
    summary.pdfsFailedDownload++
    console.error(`    DOWNLOAD FAILED: ${err.message}`)
    return
  }

  // 2. Extract text
  let text
  try {
    text = await extractText(buffer)
    if (!text || text.trim().length < 50) {
      console.warn(`    WARNING: Very little text extracted (${(text || '').length} chars) - may be scanned/image PDF`)
      if (!text || text.trim().length === 0) {
        summary.pdfsFailedParse++
        console.error(`    SKIPPED: No extractable text`)
        return
      }
    }
    console.log(`    Extracted: ${text.length} chars`)
  } catch (err) {
    summary.pdfsFailedParse++
    console.error(`    PARSE FAILED: ${err.message}`)
    return
  }

  // 3. Chunk
  const chunks = chunkText(text)
  summary.chunksCreated += chunks.length
  console.log(`    Chunks: ${chunks.length}`)

  // 4. Embed and upsert each chunk
  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await generateEmbedding(chunks[i])
      summary.embeddingsGenerated++

      await upsertChunkEmbedding({
        sourceType,
        sourceId,
        oemId,
        pdfUrl,
        chunkIndex: i,
        chunkText: chunks[i],
        embedding,
        metadata: {
          total_chunks: chunks.length,
          chunk_chars: chunks[i].length,
          pdf_size_bytes: buffer.length,
          extracted_text_chars: text.length,
        },
      })
      summary.embeddingsUpserted++

      // Progress indicator for large PDFs
      if (chunks.length > 10 && (i + 1) % 10 === 0) {
        console.log(`    Progress: ${i + 1}/${chunks.length} chunks`)
      }

      // Rate limit
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    } catch (err) {
      summary.embeddingsFailed++
      console.error(`    CHUNK ${i} FAILED: ${err.message}`)
    }
  }

  console.log(`    Done: ${chunks.length} chunks embedded`)
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== PDF Vectorization Pipeline ===')
  console.log(`Temp dir: ${TMP_DIR}`)
  console.log()

  // ── 1. Fetch brochure URLs from vehicle_models ──
  console.log('--- Fetching brochure URLs from vehicle_models ---')
  const { data: brochureModels, error: brochureErr } = await supabase
    .from('vehicle_models')
    .select('id, oem_id, slug, name, brochure_url')
    .not('brochure_url', 'is', null)
    .order('oem_id')

  if (brochureErr) {
    console.error('Failed to fetch brochure models:', brochureErr.message)
    process.exit(1)
  }
  summary.brochuresFound = brochureModels.length
  console.log(`Found ${brochureModels.length} models with brochure URLs`)

  // ── 2. Fetch guidelines URLs from oem_portals ──
  console.log('\n--- Fetching guidelines URLs from oem_portals ---')
  const { data: guidelinesPortals, error: guidelinesErr } = await supabase
    .from('oem_portals')
    .select('id, oem_id, portal_name, guidelines_pdf_url')
    .not('guidelines_pdf_url', 'is', null)
    .order('oem_id')

  if (guidelinesErr) {
    console.error('Failed to fetch guidelines portals:', guidelinesErr.message)
    process.exit(1)
  }
  summary.guidelinesFound = guidelinesPortals.length
  console.log(`Found ${guidelinesPortals.length} portals with guidelines URLs`)

  const totalPdfs = brochureModels.length + guidelinesPortals.length
  console.log(`\nTotal PDFs to process: ${totalPdfs}`)
  console.log()

  // ── 3. Process brochures ──
  if (brochureModels.length > 0) {
    console.log('=== Processing Brochures ===')
    let idx = 0
    for (const model of brochureModels) {
      idx++
      await processPdf({
        sourceType: 'brochure',
        sourceId: model.id,
        oemId: model.oem_id,
        pdfUrl: model.brochure_url,
        label: `brochure ${idx}/${brochureModels.length} | ${model.oem_id} | ${model.slug}`,
      })
    }
  }

  // ── 4. Process guidelines ──
  if (guidelinesPortals.length > 0) {
    console.log('\n=== Processing Guidelines ===')
    let idx = 0
    for (const portal of guidelinesPortals) {
      idx++
      await processPdf({
        sourceType: 'guidelines',
        sourceId: portal.id,
        oemId: portal.oem_id,
        pdfUrl: portal.guidelines_pdf_url,
        label: `guidelines ${idx}/${guidelinesPortals.length} | ${portal.oem_id} | ${portal.portal_name}`,
      })
    }
  }

  // ── 5. Summary ──
  console.log('\n\n========================================')
  console.log('           PIPELINE SUMMARY')
  console.log('========================================')
  console.log(`  Brochures found:       ${summary.brochuresFound}`)
  console.log(`  Guidelines found:      ${summary.guidelinesFound}`)
  console.log(`  PDFs downloaded:       ${summary.pdfsDownloaded}`)
  console.log(`  PDFs failed download:  ${summary.pdfsFailedDownload}`)
  console.log(`  PDFs failed parse:     ${summary.pdfsFailedParse}`)
  console.log(`  Chunks created:        ${summary.chunksCreated}`)
  console.log(`  Embeddings generated:  ${summary.embeddingsGenerated}`)
  console.log(`  Embeddings upserted:   ${summary.embeddingsUpserted}`)
  console.log(`  Embeddings failed:     ${summary.embeddingsFailed}`)
  console.log('========================================')

  if (summary.pdfsFailedDownload > 0 || summary.pdfsFailedParse > 0 || summary.embeddingsFailed > 0) {
    console.log('\nCompleted with some errors. Review output above for details.')
  } else {
    console.log('\nAll PDFs processed successfully.')
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err)
  process.exit(1)
})
