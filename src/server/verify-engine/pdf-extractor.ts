// ── Verify Engine: PDF deep scan ─────────────────────────────────────────────
// Calls the doc-extract mini-service (port 3004) to get per-page text, then
// runs the same logic as the Python reference: detect printed page numbers
// from top/bottom margins and locate the verbatim quote. Module 1 adds a
// token-based fuzzy + keyword-proximity matcher for paraphrased quotes.

interface ExtractedPage {
  number: number
  text: string
}

export interface FileScanResult {
  status: 'VERIFIED_EXACT' | 'VERIFIED_CORRECTED' | 'VERIFIED_SEMANTIC' | null
  printedPage: string | null
  message: string | null
  matchScore: number // 0..1 — how confident the match is
  snippet: string | null // the matching passage from the page
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '') // Arabic diacritics + tatweel
    .replace(/[\u0622\u0623\u0625]/g, '\u0627') // alef variants
    .replace(/\u0629/g, '\u0647') // taa marbuta
    .replace(/\u0649/g, '\u064A') // alef maqsura
    .replace(/[«»"“”‘’`(){}\[\],;:!?؟.,\-–—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Stopwords we ignore when computing keyword proximity (English + Arabic).
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those', 'it', 'as', 'by',
  'from', 'at', 'which', 'but', 'not', 'have', 'has', 'had', 'do', 'does', 'did',
  'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'كان',
  'كانت', 'يكون', 'أن', 'إن', 'ما', 'لا', 'إلا', 'قد', 'كل', 'بعض', 'غير', 'بين',
])

function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

// Read the top/bottom margin of a page and detect a standalone page number
// (excluding years like 2016).
function extractPrintedPage(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  const margins = [lines[0], lines[lines.length - 1], lines[1] || '', lines[lines.length - 2] || '']
  for (const line of margins) {
    if (!line) continue
    const pure = line.replace(/[-–—|.()\s]/g, '')
    if (/^\d{1,4}$/.test(pure)) {
      const n = parseInt(pure, 10)
      if (n >= 1 && n <= 9999 && !/^(19|20)\d{2}$/.test(pure)) {
        return pure
      }
    }
  }
  return null
}

export async function extractPagesFromPdf(file: File): Promise<ExtractedPage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const res = await fetch('http://localhost:3004/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Kind': 'pdf' },
    body: bytes,
  })
  if (!res.ok) throw new Error('تعذّر استخراج نص الملف من الخدمة.')
  const data = (await res.json()) as { ok: boolean; pages?: ExtractedPage[] }
  return data.pages || []
}

// ── Stage 1a: exact string match (normalized) ────────────────────────────────
export function scanFileForQuote(
  pages: ExtractedPage[],
  quote: string,
  expectedPage: string,
): FileScanResult {
  const qNorm = normalize(quote)
  if (!qNorm) return { status: null, printedPage: null, message: null, matchScore: 0, snippet: null }

  for (const page of pages) {
    const textNorm = normalize(page.text)
    if (textNorm.includes(qNorm)) {
      const printed = extractPrintedPage(page.text)
      if (expectedPage && printed && printed !== expectedPage) {
        return {
          status: 'VERIFIED_CORRECTED',
          printedPage: printed,
          message: `الاقتباس موجود فعلاً لكن في الصفحة المطبوعة ${printed} لا ${expectedPage}. تم التصحيح تلقائياً.`,
          matchScore: 1,
          snippet: extractSnippet(page.text, quote),
        }
      }
      const finalPage = printed || String(page.number)
      return {
        status: 'VERIFIED_EXACT',
        printedPage: finalPage,
        message: 'الاقتباس موجود حرفياً في الملف — التوثيق صحيح 100%.',
        matchScore: 1,
        snippet: extractSnippet(page.text, quote),
      }
    }
  }
  return { status: null, printedPage: null, message: null, matchScore: 0, snippet: null }
}

// ── Stage 1b: semantic / paraphrase matcher (Module 1) ───────────────────────
// Token-based fuzzy match + keyword-proximity density. We compute, for every
// page, the proportion of the quote's meaningful keywords that appear in that
// page (coverage), and the average distance between consecutive matched
// keywords (proximity — the tighter they cluster, the more likely the page
// really discusses the same concept). The page with the highest density wins.
export function scanFileSemantic(
  pages: ExtractedPage[],
  quote: string,
  expectedPage: string,
): FileScanResult {
  const qTokens = tokenize(quote)
  if (qTokens.length < 3) {
    return { status: null, printedPage: null, message: null, matchScore: 0, snippet: null }
  }

  let best: { page: ExtractedPage; score: number; coverage: number; proximity: number; snippet: string } | null = null

  for (const page of pages) {
    const pageTokens = tokenize(page.text)
    if (pageTokens.length === 0) continue

    // keyword co-occurrence: how many of the quote's keywords appear in this page?
    const pageSet = new Set(pageTokens)
    let matched = 0
    const positions: number[] = []
    for (let i = 0; i < pageTokens.length; i++) {
      if (qTokens.includes(pageTokens[i])) {
        positions.push(i)
      }
    }
    matched = new Set(qTokens.filter((t) => pageSet.has(t))).size
    const coverage = matched / qTokens.length
    if (coverage < 0.35) continue // need at least 35% keyword overlap

    // proximity: average gap between consecutive matched keyword positions.
    // Tighter clustering (smaller avg gap) = the keywords co-occur in one
    // passage rather than scattered across the page.
    let proximity = 1
    if (positions.length > 1) {
      let totalGap = 0
      for (let i = 1; i < positions.length; i++) totalGap += positions[i] - positions[i - 1]
      const avgGap = totalGap / (positions.length - 1)
      // normalize: gap of 1–5 = perfect, gap > 30 = poor
      proximity = Math.max(0, 1 - (avgGap - 1) / 30)
    }

    // density: matched keywords per 1000 page tokens — rewards short pages
    // where the concept is the main topic.
    const density = (matched / pageTokens.length) * 1000
    const densityScore = Math.min(1, density / 15)

    // blended score
    const score = 0.55 * coverage + 0.25 * proximity + 0.2 * densityScore
    if (!best || score > best.score) {
      best = { page, score, coverage, proximity, snippet: extractSnippet(page.text, quote) }
    }
  }

  if (!best || best.score < 0.45) {
    return { status: null, printedPage: null, message: null, matchScore: best?.score || 0, snippet: null }
  }

  const printed = extractPrintedPage(best.page.text)
  const finalPage = printed || String(best.page.number)
  const pct = Math.round(best.score * 100)

  if (expectedPage && printed && printed !== expectedPage) {
    return {
      status: 'VERIFIED_SEMANTIC',
      printedPage: finalPage,
      message: `مطابقة دلالية: المعنى موجود في الصفحة المطبوعة ${printed} لا ${expectedPage}. تم التصحيح. تطابق ${pct}%.`,
      matchScore: best.score,
      snippet: best.snippet,
    }
  }
  return {
    status: 'VERIFIED_SEMANTIC',
    printedPage: finalPage,
    message: `مطابقة دلالية: النص في الصفحة ${finalPage} يحمل نفس معنى اقتباسك (إعادة صياغة). تطابق ${pct}%.`,
    matchScore: best.score,
    snippet: best.snippet,
  }
}

// Best-effort: pull a ~200-char window from the page around the first matched
// keyword, so the user can eyeball the passage.
function extractSnippet(pageText: string, quote: string): string {
  const qTokens = tokenize(quote).slice(0, 4)
  if (qTokens.length === 0) return pageText.slice(0, 200)
  const lower = pageText.toLowerCase()
  let idx = -1
  for (const t of qTokens) {
    const i = lower.indexOf(t)
    if (i !== -1) { idx = i; break }
  }
  if (idx === -1) return pageText.slice(0, 200)
  const start = Math.max(0, idx - 80)
  return pageText.slice(start, start + 240).trim()
}
