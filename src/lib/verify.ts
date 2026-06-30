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
