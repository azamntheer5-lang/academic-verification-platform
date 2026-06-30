// Text-matching helpers for citation verification.
// Used by the server (/api/verify) as the authoritative exact/fuzzy check
// against the stored page content.

// Normalize text for comparison: lowercase, collapse whitespace, strip Arabic
// diacritics (tashkeel) and tatweel, normalize common punctuation.
export function normalizeForMatch(input: string): string {
  if (!input) return ''
  let t = input
    // remove Arabic diacritics (harakat) and tatweel
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    // normalize Arabic letter forms
    .replace(/[\u0622\u0623\u0625]/g, '\u0627') // alef variants -> bare alef
    .replace(/\u0629/g, '\u0647') // taa marbuta -> haa
    .replace(/\u0649/g, '\u064A') // alef maqsura -> yaa
    // strip punctuation that rarely matters for matching
    .replace(/[«»"“”‘’`()\[\]{},;:!?؟.,\-–—_]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  return t
}

// Token-based similarity (Jaccard over word sets) + a length-aware overlap.
// Returns a score in [0, 1].
export function similarity(a: string, b: string): number {
  const na = normalizeForMatch(a)
  const nb = normalizeForMatch(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = new Set(na.split(' '))
  const tb = new Set(nb.split(' '))
  let inter = 0
  for (const w of ta) if (tb.has(w)) inter++
  const union = ta.size + tb.size - inter
  const jaccard = union ? inter / union : 0
  // coverage: how much of the quote is covered by the target
  const coverage = ta.size ? inter / ta.size : 0
  // blend: coverage dominates because a short quote inside a long page should
  // still score high when fully present.
  return Math.min(1, 0.4 * jaccard + 0.6 * coverage)
}

// Find the best matching window in `haystack` for the `needle` quote.
// Returns { score, snippet } where snippet is the closest passage.
export function bestWindowMatch(needle: string, haystack: string, windowWords = 40): {
  score: number
  snippet: string
} {
  const needleN = normalizeForMatch(needle)
  const hayN = normalizeForMatch(haystack)
  if (!needleN || !hayN) return { score: 0, snippet: '' }

  // Try exact substring first (on normalized text).
  const idx = hayN.indexOf(needleN)
  if (idx !== -1) {
    // map back to a snippet of the original haystack around the match
    return { score: 1, snippet: extractOriginalSnippet(haystack, idx, needleN.length) }
  }

  // Sliding window over haystack tokens.
  const hayTokens = hayN.split(' ')
  const needleTokens = needleN.split(' ')
  const nNeedle = needleTokens.length
  const nHay = hayTokens.length
  if (nHay < nNeedle) {
    return { score: similarity(needle, haystack), snippet: haystack.slice(0, 200) }
  }

  const needleSet = new Set(needleTokens)
  let best = 0
  let bestStart = 0
  const step = Math.max(1, Math.floor(nNeedle / 2))
  for (let start = 0; start <= nHay - nNeedle; start += step) {
    const window = hayTokens.slice(start, start + nNeedle)
    let inter = 0
    const wSet = new Set(window)
    for (const w of needleSet) if (wSet.has(w)) inter++
    const coverage = nNeedle ? inter / nNeedle : 0
    const jaccard = inter / (nNeedle + window.length - inter || 1)
    const score = 0.35 * jaccard + 0.65 * coverage
    if (score > best) {
      best = score
      bestStart = start
    }
  }

  // Build a snippet from the original haystack around bestStart (token based, approximate)
  const origTokens = haystack.split(/(\s+)/) // keep whitespace
  // approximate mapping: use token index in a whitespace-split of original
  const origPlain = haystack.split(/\s+/)
  const snippetStart = Math.max(0, bestStart)
  const snippetEnd = Math.min(origPlain.length, bestStart + nNeedle + windowWords)
  const snippet = origPlain.slice(snippetStart, snippetEnd).join(' ')
  return { score: best, snippet }
}

function extractOriginalSnippet(haystack: string, normStart: number, normLen: number): string {
  // Best-effort: we only have normalized positions, so recover a nearby slice
  // of the original text. For exact matches we just return a window around the
  // first occurrence of the needle's first few words.
  const firstWords = haystack
    .split(/\s+/)
    .slice(0, 0) // placeholder; we compute below
  void firstWords
  // Simpler: find the substring in original by searching for the first 4
  // normalized words back in the original — but to keep it robust just return
  // a 300-char window around the character index proportion.
  const ratio = haystack.length / Math.max(1, normalizeForMatch(haystack).length)
  const origApproxStart = Math.max(0, Math.floor(normStart * ratio) - 60)
  return haystack.slice(origApproxStart, origApproxStart + 360)
}

export function classifyMatch(score: number, exact: boolean): {
  status: 'verified' | 'partial' | 'mismatch'
} {
  if (exact || score >= 0.85) return { status: 'verified' }
  if (score >= 0.5) return { status: 'partial' }
  return { status: 'mismatch' }
}

// ── Page-number verification against extracted source pages ───────────────────

export interface PageVerifyInput {
  quote: string // the verbatim text claimed to appear on the page
  claimedPage?: number | null // the page number the researcher claims
  pages: { number: number; text: string }[] // pages extracted from the uploaded file
}

export interface PageVerifyResult {
  status: 'verified' | 'wrong_page' | 'not_found' | 'no_quote'
  confidence: number // 0..1
  claimedPage: number | null
  matchedPage: number | null // the page where the quote actually appears
  matchScore: number // 0..1
  exactMatch: boolean
  snippet: string // the matching passage from the page
  note: string
  searchedPages: number
  candidates: { page: number; score: number }[] // top matches
}

// Decide whether a page's text corresponds to a given "logical" page number.
// Academic books often have front matter, so the PDF page index rarely equals
// the printed page number. We try two strategies:
//   (a) Look for the claimed page number printed inside the page text.
//   (b) Fall back to matching the quote against every page and report the best.
export function verifyPageNumber(input: PageVerifyInput): PageVerifyResult {
  const { quote, claimedPage, pages } = input
  const searchedPages = pages.length

  if (!quote || !quote.trim()) {
    return {
      status: 'no_quote',
      confidence: 0,
      claimedPage: claimedPage ?? null,
      matchedPage: null,
      matchScore: 0,
      exactMatch: false,
      snippet: '',
      note: 'لا يوجد نص مقتبس للتحقق منه. أدخل الاقتباس الحرفي المراد التحقق من صفحته.',
      searchedPages,
      candidates: [],
    }
  }

  // Strategy A: find pages whose printed page-number (mentioned in text) equals claimedPage
  let physicalPagesForClaimed: number[] = []
  if (claimedPage) {
    physicalPagesForClaimed = findPagesByPrintedNumber(pages, claimedPage)
  }

  // Score every page for the quote
  const scored = pages
    .map((p) => {
      const { score, snippet } = bestWindowMatch(quote, p.text, 30)
      const exact = score >= 0.999 || normalizeForMatch(p.text).includes(normalizeForMatch(quote))
      return { page: p.number, score, snippet, exact }
    })
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  const candidates = scored.slice(0, 5).map((s) => ({ page: s.page, score: Math.round(s.score * 100) / 100 }))

  if (!top || top.score < 0.35) {
    return {
      status: 'not_found',
      confidence: 0.2,
      claimedPage: claimedPage ?? null,
      matchedPage: null,
      matchScore: top ? top.score : 0,
      exactMatch: false,
      snippet: top ? top.snippet : '',
      note: `لم يُعثر على الاقتباس في أي من صفحات الملف (${searchedPages} صفحة). تأكد أن الملف هو المصدر الصحيح وأن الاقتباس حرفي.`,
      searchedPages,
      candidates,
    }
  }

  const exactMatch = top.exact || top.score >= 0.85
  const matchedPage = top.page

  // Did the researcher claim a page?
  if (claimedPage) {
    const claimedMatchesPhysical = physicalPagesForClaimed.includes(matchedPage)
    const claimedEqualsMatched = claimedPage === matchedPage

    if (claimedEqualsMatched || claimedMatchesPhysical) {
      return {
        status: 'verified',
        confidence: Math.min(1, top.score),
        claimedPage,
        matchedPage,
        matchScore: top.score,
        exactMatch,
        snippet: top.snippet,
        note: exactMatch
          ? `الاقتباس موجود حرفياً في الصفحة ${matchedPage} من الملف — مطابق لما ذكرته.`
          : `الاقتباس موجود في الصفحة ${matchedPage} من الملف مع تطابق قوي (${Math.round(top.score * 100)}%) — مطابق للصفحة المذكورة.`,
        searchedPages,
        candidates,
      }
    }

    // The quote was found, but on a different page
    return {
      status: 'wrong_page',
      confidence: Math.min(1, top.score),
      claimedPage,
      matchedPage,
      matchScore: top.score,
      exactMatch,
      snippet: top.snippet,
      note: `الاقتباس موجود فعلاً في الملف، لكن في الصفحة ${matchedPage} لا الصفحة ${claimedPage} التي ذكرتها. الصفحة الصحيحة: ${matchedPage}.`,
      searchedPages,
      candidates,
    }
  }

  // No page claimed by the researcher — just report where it was found
  return {
    status: 'verified',
    confidence: Math.min(1, top.score),
    claimedPage: null,
    matchedPage,
    matchScore: top.score,
    exactMatch,
    snippet: top.snippet,
    note: exactMatch
      ? `الاقتباس موجود حرفياً في الصفحة ${matchedPage} من الملف.`
      : `الاقتباس موجود في الصفحة ${matchedPage} من الملف مع تطابق ${Math.round(top.score * 100)}%.`,
    searchedPages,
    candidates,
  }
}

// Find pages that *contain* the printed page number as a token. Crude but
// works for many academic books that print the page number in a header/footer.
function findPagesByPrintedNumber(
  pages: { number: number; text: string }[],
  target: number,
): number[] {
  const out: number[] = []
  for (const p of pages) {
    const text = p.text || ''
    // look for the number as a standalone token (not part of a year/figure)
    const re = new RegExp(`(^|[^0-9])${target}([^0-9]|$)`)
    if (re.test(text)) out.push(p.number)
  }
  return out
}
