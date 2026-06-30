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
    .replace(/[«»"“”‘’`(){}\[\],;:!?؟.,\-–—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Arabic NLP: normalization, stop-words, light stemming ────────────────────
// Implements advanced Arabic processing so the semantic matcher can recognize
// that "التطورات", "متطور", "وتطور" all share the root "تطور".

/**
 * Normalizes Arabic text:
 *   - strips all diacritics (harakat: fatha/damma/kasra/tanwin/shadda/sukun)
 *   - removes tatweel (ـ)
 *   - unifies alef-hamza variants (أ إ آ → ا)
 *   - converts final taa-marbuta (ة) to haa (ه)
 *   - converts final alef-maqsura (ى) to yaa (ي)
 * Runs before tokenization so every downstream comparison uses the canonical
 * form of each Arabic word.
 */
export function normalizeArabic(text: string): string {
  if (!text) return ''
  let t = text
  // 1. Diacritics (harakat) — U+064B..U+065F (tanwin + shadda + sukun + harakat),
  //    superscript alef U+0670, and Quranic annotation signs U+06D6..U+06ED.
  t = t.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
  // 2. Tatweel (ـ) — elongation marker
  t = t.replace(/\u0640/g, '')
  // 3. Alef-hamza variants → bare alef
  t = t.replace(/[\u0622\u0623\u0625]/g, '\u0627')
  // 4. Final taa-marbuta → haa (only at word end so middle ة in rare loanwords
  //    stays, but in practice ة almost always marks the feminine ending)
  t = t.replace(/\u0629/g, '\u0647')
  // 5. Final alef-maqsura → yaa
  t = t.replace(/\u0649(?=\s|$)/g, '\u064A')
  return t
}

// ── Expanded Arabic + English stop-words ─────────────────────────────────────
// Covers: prepositions, demonstratives, relative pronouns, detached & attached
// pronouns, conjunctions, particles, auxiliary verbs — in both Arabic and English.
const STOPWORDS = new Set([
  // ── English ──
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those', 'it', 'as', 'by',
  'from', 'at', 'which', 'but', 'not', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'shall', 'must',
  // ── Arabic: prepositions & particles ──
  'في', 'من', 'على', 'الى', 'عن', 'مع', 'الى', 'حتى', 'عند', 'لدى', 'خلال',
  'بين', 'امام', 'خلف', 'فوق', 'تحت', 'دون', 'بدون', 'بعد', 'قبل', 'نحو',
  'لكن', 'لكن', 'بل', 'او', 'و', 'ف', 'ثم', 'ل', 'ب', 'ك', 'س',
  // ── Arabic: demonstratives ──
  'هذا', 'هذه', 'ذلك', 'تلك', 'هذان', 'هاتان', 'هؤلاء', 'اولئك', 'هنا', 'هناك',
  // ── Arabic: relative pronouns ──
  'الذي', 'التي', 'الذين', 'اللاتي', 'اللواتي', 'اللائي', 'من', 'ما', 'مهما',
  // ── Arabic: detached pronouns ──
  'هو', 'هي', 'هم', 'هن', 'انا', 'نحن', 'انت', 'انتم', 'انتما', 'انتن',
  // ── Arabic: attached pronouns (post-normalization they appear as suffixes,
  //    but common standalone forms are listed) ──
  'يه', 'ها', 'هم', 'هن', 'نا', 'ك', 'كن', 'كم', 'هم',
  // ── Arabic: auxiliaries & particles ──
  'كان', 'كانت', 'يكون', 'تكون', 'كانوا', 'يكونون', 'اصبح', 'اصبحت', 'ظل', 'صار',
  'ان', 'ان', 'كيف', 'متى', 'اين', 'لم', 'لن', 'لا', 'ما', 'هل', 'كم', 'الا', 'قد',
  'كل', 'بعض', 'غير', 'كذلك', 'ايضا', 'فقط', 'حيث', 'بحيث', 'لكي', 'كي', 'لان',
  'كما', 'عندما', 'بينما', 'اذا', 'إذا', 'ان', 'أو', 'اما', 'إما',
])

function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map((w) => {
      // Route through the Arabic normalizer + stemmer if the token contains
      // Arabic letters; otherwise use the English stemmer.
      if (/[\u0600-\u06FF]/.test(w)) {
        return arabicStemmer(normalizeArabic(w))
      }
      return stem(w)
    })
}

// ── Light Arabic stemmer (ISRI-inspired) ─────────────────────────────────────
// Removes the most common Arabic prefixes (definite articles, conjunction+
// article, preposition+article) and suffixes (plural, feminine, relative,
// possessive) to collapse inflected forms onto their stem/root.
//
//   "التطورات"  → "تطور"
//   "والتطور"   → "تطور"
//   "مكتشفات"   → "كشف"   (after prefix مـ + suffix ات)
//   "متطور"     → "تطور"
//
// This is intentionally light — we don't reconstruct the triliteral root
// (that needs a dictionary); we strip surface morphology, which is enough for
// semantic matching of paraphrased quotes.
const ARABIC_PREFIXES = [
  // longest first so we match the most specific prefix
  'والب', 'وال', 'فال', 'بال', 'كال', 'لال',   // conjunction/prep + ال
  'ال',   'وال', 'فال', 'بال', 'كال',         // (dedupe-safe, order matters)
  'ولل', 'فلل', 'بلل', 'كلل',                 // + لل
  'لل',  'وب', 'فب', 'لب', 'كب', 'وس', 'فس',  // + prep + single letter
  'ف',   'و',   'ب',   'ك',   'ل',   'س',
]

const ARABIC_SUFFIXES = [
  // plural / dual / feminine / relative / possessive — longest first
  'ينات', 'وات', 'يات',                                  // rare plural patterns
  'ون', 'ين', 'ات', 'ان', 'يه', 'ية', 'ها', 'هم', 'هن', 'نا', 'كم', 'كن', 'كما', 'هم',
  'ة',   'ي',   'ك',   'ه',   'ا',
]

export function arabicStemmer(word: string): string {
  if (!word) return word
  let w = word
  // Keep at least 3 chars after stripping so we don't reduce to noise.
  // Prefix strip
  for (const p of ARABIC_PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 3) {
      w = w.slice(p.length)
      break // only strip one prefix layer (the longest matched)
    }
  }
  // Suffix strip
  for (const s of ARABIC_SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length >= 3) {
      w = w.slice(0, -s.length)
      break // only strip one suffix layer
    }
  }
  // A second light pass for words like "متطورات" → after first pass strips
  // prefix "م" + suffix "ات" we'd want "تطور"; but our prefix list doesn't
  // include single-letter "م" (too aggressive). Instead, strip a leading
  // "م" if what remains starts with a recognized pattern (verb form).
  if (w.length > 4 && /^م[\u062A\u062B\u062C\u0633\u0646]/.test(w)) {
    w = w.slice(1)
  }
  return w
}

// Very lightweight English stemmer — strips common suffixes so that
// "explicit/explicitly", "program/programming/programmed", "learn/learning"
// collapse to the same token. This dramatically improves semantic matching
// for paraphrased quotes without pulling in a full NLP dependency.
function stem(w: string): string {
  if (w.length <= 4) return w
  // order matters: longest suffixes first
  for (const suf of ['ingly', 'edly', 'ings', 'edly', 'ment', 'tions', 'ation', 'ations', 'ically', 'ical', 'ions', 'tion', 'ing', 'ed', 'ies', 'ied', 'ies', 's']) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      return w.slice(0, -suf.length)
    }
  }
  return w
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
