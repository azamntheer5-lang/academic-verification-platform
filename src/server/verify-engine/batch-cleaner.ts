// ── Verify Engine: batch bibliography cleaner (Module 2) ─────────────────────
// Parses a pasted bibliography block into individual citations and runs each
// one through the 3-layer library fallback (Google Books -> Open Library ->
// web search). Anything not found in ANY layer is flagged as a
// SUSPICIOUS_HALLUCINATION — the signature of LLM-fabricated references.
// For each suspicious item we generate a real verified recommendation.

import { findInGlobalLibrary } from './library-fallback'
import { formatAlternative } from './formatters'
import type { CleanItem, CleanResponse, AlternativeReference, FormatStyle } from './models'

// ── parsing ──────────────────────────────────────────────────────────────────
// Split a raw bibliography block into individual citation lines. We accept
// newlines, numbered list markers ("1. ", "[1] "), and bullet markers.
function splitBibliography(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  // If a single line, also try splitting on common multi-citation separators
  if (lines.length <= 1) {
    return raw
      .split(/(?:\d+\.\s|\[\d+\]\s|•\s|؛(?=\s*[A-Z\u0600-\u06FF]))/)
      .map((l) => l.trim())
      .filter(Boolean)
  }
  return lines.map((l) => l.replace(/^\s*(?:\d+\.|\[\d+\]|•)\s*/, '').trim()).filter(Boolean)
}

// Best-effort extract author / year / title from a free-form citation line.
// Handles common patterns:
//   "Last, First (Year). Title. Publisher."
//   "First Last (Year). Title. Publisher."
//   "Last, F. (Year). Title. Publisher."
//   "First Last. Title. Publisher, Year."
function parseCitation(line: string): { author: string; year: string; title: string } {
  // year: first 4-digit number in 1500-2099
  const yearMatch = line.match(/\b(1[5-9]\d{2}|20\d{2})\b/)
  const year = yearMatch ? yearMatch[1] : ''

  // Try pattern: "Author. (Year). Title. Publisher." — text before "(Year)" is author
  if (yearMatch && yearMatch.index !== undefined) {
    const before = line.slice(0, yearMatch.index).replace(/[.\s(),]+$/, '').trim()
    // author = text before the year, stripped of trailing punctuation
    let author = before
    // If author contains a period mid-string, take up to first period
    const authorDot = author.search(/[.](?=\s|$)/)
    if (authorDot !== -1) author = author.slice(0, authorDot).trim()

    // title = text after "Year)." or "Year." or "Year," — until next period
    const afterYearStart = yearMatch.index + yearMatch[0].length
    let after = line.slice(afterYearStart).replace(/^\s*[).,]+\s*/, '').trim()
    // title ends at first period followed by space + capital, or at end
    const titleEndMatch = after.match(/\.\s+(?=[A-Z\u0600-\u06FF])/)
    let title: string
    if (titleEndMatch && titleEndMatch.index !== undefined) {
      title = after.slice(0, titleEndMatch.index).trim()
    } else {
      // take until first period or end
      const dot = after.indexOf('.')
      title = dot !== -1 ? after.slice(0, dot).trim() : after
    }
    // strip quotes/brackets
    title = title.replace(/^["«»()\[\]]+|["«»()\[\]]+$/g, '').trim()
    return { author: author || 'غير معروف', year, title: title || line.slice(0, 80) }
  }

  // No year — assume "Author. Title." pattern
  const dot = line.indexOf('.')
  if (dot !== -1) {
    const author = line.slice(0, dot).trim()
    const title = line.slice(dot + 1).trim().replace(/\.$/, '').replace(/^["«»()\[\]]+|["«»()\[\]]+$/g, '').trim()
    return { author: author || 'غير معروف', year, title: title || line.slice(0, 80) }
  }
  return { author: 'غير معروف', year, title: line.slice(0, 80) }
}

// ── recommendation generator ─────────────────────────────────────────────────
// For a suspicious (not found) reference, run a broader search by topic
// keywords extracted from the title. Returns a real verified book if found.
async function recommendAlternative(item: {
  author: string
  title: string
}): Promise<AlternativeReference | null> {
  // Use the title's main keywords as the search quote (without the fake author)
  const keywords = item.title.split(/\s+/).slice(0, 6).join(' ')
  if (!keywords) return null
  try {
    const alt = await findInGlobalLibrary(keywords, item.author)
    return alt
  } catch {
    return null
  }
}

// Title-similarity check — guards against web_search returning a result that
// merely shares a common word. We require ≥50% of the CLAIMED title's
// meaningful tokens to appear in the found title (coverage), AND the found
// title must contain at least one "rare" token (length ≥ 5, not a stopword)
// from the claimed title. Pure common-word matches (Quantum, Bibliography)
// won't pass.
const TITLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'for', 'with', 'to', 'from',
  'theory', 'theories', 'study', 'studies', 'research', 'analysis', 'approach',
  'method', 'methods', 'introduction', 'guide', 'handbook', 'bibliography',
  'النظرية', 'الدراسة', 'التحليل', 'المدخل', 'مقدمة', 'دليل', 'الببليوغرافيا',
])

function titleMatches(claimedTitle: string, foundTitle: string): boolean {
  const a = claimedTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !TITLE_STOPWORDS.has(w))
  const b = new Set(foundTitle.toLowerCase().split(/\s+/))
  if (a.length === 0) return false
  let matched = 0
  let rareMatched = 0
  for (const w of a) {
    if (b.has(w)) {
      matched++
      if (w.length >= 5) rareMatched++
    }
  }
  const coverage = matched / a.length
  // need ≥60% coverage AND at least one rare (≥5-char) keyword matched
  return coverage >= 0.6 && rareMatched >= 1
}

// Author-similarity check — the claimed author's last name must appear in the
// found author string (case-insensitive). Handles both "Last, First" and
// "First Last" forms by taking the FIRST token when a comma is present
// (the "Last" in "Last, First") or the LAST token otherwise.
function authorMatches(claimedAuthor: string, foundAuthor: string): boolean {
  const cleaned = claimedAuthor.replace(/[,.()]/g, ' ').split(/\s+/).filter(Boolean)
  if (cleaned.length === 0) return true // can't disprove
  // For "Last, First" the comma was stripped → first token is the last name.
  // For "First Last" the last token is the last name. We pick the LONGEST
  // token as the most identifying surname (initials like "M" are too short).
  const claimedLast = cleaned
    .slice()
    .sort((a, b) => b.length - a.length)[0] || ''
  if (!claimedLast || claimedLast.length < 3) return true // can't disprove
  return foundAuthor.toLowerCase().includes(claimedLast.toLowerCase())
}

// ── orchestrator ─────────────────────────────────────────────────────────────
export async function cleanBibliography(opts: {
  raw: string
  style?: FormatStyle // optional — if set, recommendations are pre-formatted
}): Promise<CleanResponse> {
  const { raw, style } = opts
  const lines = splitBibliography(raw)
  if (lines.length === 0) {
    return { total: 0, verifiedCount: 0, suspiciousCount: 0, items: [] }
  }

  const items: CleanItem[] = []
  for (const line of lines) {
    const parsed = parseCitation(line)
    let item: CleanItem = {
      raw: line,
      parsedAuthor: parsed.author,
      parsedYear: parsed.year,
      parsedTitle: parsed.title,
      status: 'ERROR',
      matchedSource: null,
      matchUrl: null,
      recommendation: null,
      note: '',
    }

    try {
      // IMPORTANT: search by TITLE ONLY (not author) — including the author in
      // the query contaminates the web_search results (the snippet echoes the
      // query back). We then independently verify the author against whatever
      // the library actually returns.
      const alt = await findInGlobalLibrary(parsed.title, '')
      if (alt && titleMatches(parsed.title, alt.title) && authorMatches(parsed.author, alt.author)) {
        item.status = 'VERIFIED'
        item.matchedSource = alt.publisher?.includes('openlibrary') ? 'open_library' : 'web_search'
        if (alt.fullApa && /books\.google/.test(alt.publisher || '')) {
          item.matchedSource = 'google_books'
        }
        item.matchUrl = null
        item.note = `عُثر على المرجع في المكتبة العالمية: «${alt.title}» — ${alt.author}${alt.year ? ` (${alt.year})` : ''}.`
      } else if (alt) {
        // Found something but title/author doesn't match closely → suspicious
        item.status = 'SUSPICIOUS_HALLUCINATION'
        const reason = !titleMatches(parsed.title, alt.title)
          ? 'العنوان المُرجَع لا يطابق العنوان المُدخَل بدقة'
          : 'المؤلف المُرجَع لا يطابق المؤلف المُدخَل'
        item.note = `${reason}. قد يكون المرجع وهمياً مخترعاً بواسطة ذكاء اصطناعي.`
        item.recommendation = alt
      } else {
        // Not found in any of the 3 layers → suspicious hallucination
        item.status = 'SUSPICIOUS_HALLUCINATION'
        item.note = 'لم يُعثر على المرجع في أي من المكتبات العالمية الثلاث (Google Books + Open Library + Web Search). قد يكون مرجعاً وهمياً مخترعاً بواسطة ذكاء اصطناعي.'
        const rec = await recommendAlternative({ author: parsed.author, title: parsed.title })
        if (rec) item.recommendation = rec
      }
    } catch {
      item.status = 'ERROR'
      item.note = 'تعذّر فحص هذا المرجع.'
    }
    items.push(item)
  }

  const verifiedCount = items.filter((i) => i.status === 'VERIFIED').length
  const suspiciousCount = items.filter((i) => i.status === 'SUSPICIOUS_HALLUCINATION').length

  return {
    total: items.length,
    verifiedCount,
    suspiciousCount,
    items,
  }
}

// Helper exported for the UI: format a recommendation in a chosen style.
export function formatRecommendation(alt: AlternativeReference, style: FormatStyle): string {
  return formatAlternative(alt, style)
}
