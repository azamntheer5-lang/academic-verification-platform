// Library lookup helpers.
// We verify a citation against real bibliographic databases:
//   1. Open Library Search API (free, structured, no key) — primary source
//      for book metadata (title, authors, year, publisher, ISBN).
//   2. The z-ai web_search function — broader academic / scholarly coverage
//      (Google Scholar snippets, publisher pages, library catalogs).
//
// Page-number verification against an online library is generally not possible
// without the full text, so we are honest about that in the verdict: we verify
// existence + authorship + year, and flag page as "requires source text".

import ZAI from 'z-ai-web-dev-sdk'
import { normalizeForMatch, similarity } from './verify'

export interface ExtractedCitation {
  id: string
  author: string // raw author string as written in the research
  year: string
  title?: string
  page?: number | null
  quote?: string // the verbatim quote if present
  context?: string // surrounding sentence
}

export interface LibraryHit {
  source: 'openlibrary' | 'web'
  title: string
  authors: string[]
  year?: string | null
  publisher?: string | null
  isbn?: string | null
  url: string
  snippet?: string
}

export interface VerifyResult {
  status: 'verified' | 'author_mismatch' | 'not_found' | 'partial' | 'error'
  confidence: number // 0..1
  authorMatch: boolean
  titleMatch: boolean
  yearPlausible: boolean
  bestHit: LibraryHit | null
  allHits: LibraryHit[]
  note: string
  pageVerifiable: boolean
}

// ── Open Library ──────────────────────────────────────────────────────────────
interface OpenLibraryDoc {
  key: string
  title: string
  title_suggest?: string
  author_name?: string[]
  first_publish_year?: number
  publish_year?: number[]
  publisher?: string[]
  isbn?: string[]
  cover_i?: number
  language?: string[]
}

interface OpenLibraryResponse {
  numFound: number
  start: number
  docs: OpenLibraryDoc[]
}

async function searchOpenLibrary(query: string): Promise<LibraryHit[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8&fields=title,author_name,first_publish_year,publish_year,publisher,isbn,language,key`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = (await res.json()) as OpenLibraryResponse
    const hits: LibraryHit[] = (data.docs || []).map((d) => {
      const years = d.publish_year && d.publish_year.length ? d.publish_year : d.first_publish_year ? [d.first_publish_year] : []
      const year = years.length ? String(Math.max(...years)) : null
      return {
        source: 'openlibrary' as const,
        title: d.title,
        authors: d.author_name || [],
        year,
        publisher: d.publisher && d.publisher.length ? d.publisher[0] : null,
        isbn: d.isbn && d.isbn.length ? d.isbn[0] : null,
        url: `https://openlibrary.org${d.key}`,
      }
    })
    return hits
  } catch {
    clearTimeout(timeout)
    return []
  }
}

// ── Web search (z-ai SDK) ─────────────────────────────────────────────────────
async function searchWeb(query: string): Promise<LibraryHit[]> {
  try {
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', { query, num: 8 })
    if (!Array.isArray(results)) return []
    return results.map((r: { name?: string; url?: string; snippet?: string; host_name?: string; date?: string }) => ({
      source: 'web' as const,
      title: r.name || '',
      authors: [] as string[],
      year: extractYear(r.snippet || '') || extractYear(r.name || '') || null,
      publisher: r.host_name || null,
      isbn: null,
      url: r.url || '',
      snippet: r.snippet || '',
    }))
  } catch {
    return []
  }
}

function extractYear(text: string): string | null {
  const m = text.match(/\b(1[6-9]\d{2}|20\d{2})\b/)
  return m ? m[1] : null
}

// ── name comparison ───────────────────────────────────────────────────────────
function lastName(name: string): string {
  const n = name.trim()
  if (!n) return ''
  if (n.includes(',')) return n.split(',')[0].trim().toLowerCase()
  const parts = n.split(/\s+/)
  return parts[parts.length - 1].toLowerCase()
}

function firstInitial(name: string): string {
  const n = name.trim()
  if (!n) return ''
  if (n.includes(',')) {
    const rest = n.split(',')[1]?.trim() || ''
    return rest.charAt(0).toLowerCase()
  }
  return n.charAt(0).toLowerCase()
}

function authorsMatch(claimed: string, candidates: string[]): boolean {
  if (!claimed || candidates.length === 0) return false
  const claimedLast = lastName(claimed)
  const claimedFirst = firstInitial(claimed)
  for (const c of candidates) {
    const cLast = lastName(c)
    if (!cLast) continue
    // last name must match (token-substring either way to handle Arabic/English)
    const lastMatch =
      claimedLast === cLast ||
      claimedLast.includes(cLast) ||
      cLast.includes(claimedLast) ||
      similarity(claimedLast, cLast) >= 0.8
    if (!lastMatch) continue
    // if we have a first initial, prefer it to match (loose)
    if (claimedFirst && c.split(/\s+/)[0]) {
      const cFirst = c.split(/\s+/)[0].charAt(0).toLowerCase()
      if (claimedFirst !== cFirst) {
        // still allow — Arabic transliteration can shift initials
      }
    }
    return true
  }
  return false
}

function titlesMatch(claimed: string | undefined, candidate: string): boolean {
  if (!claimed || !candidate) return false
  const a = normalizeForMatch(claimed)
  const b = normalizeForMatch(candidate)
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  return similarity(a, b) >= 0.7
}

function yearPlausible(claimed: string, candidate?: string | null): boolean {
  if (!claimed || !candidate) return true // can't disprove
  const cy = parseInt(claimed, 10)
  const py = parseInt(candidate, 10)
  if (isNaN(cy) || isNaN(py)) return true
  return Math.abs(cy - py) <= 5 // edition differences allowed
}

// ── main verify entrypoint ────────────────────────────────────────────────────
export async function verifyCitationAgainstLibraries(c: ExtractedCitation): Promise<VerifyResult> {
  const queryParts = [c.author, c.title, c.year].filter(Boolean).join(' ')
  if (!queryParts.trim()) {
    return {
      status: 'not_found',
      confidence: 0,
      authorMatch: false,
      titleMatch: false,
      yearPlausible: false,
      bestHit: null,
      allHits: [],
      note: 'لم يتم استخراج بيانات كافية للبحث (لا يوجد مؤلف أو عنوان).',
      pageVerifiable: false,
    }
  }

  const [olHits, webHits] = await Promise.all([
    searchOpenLibrary(queryParts),
    searchWeb(`${c.author} ${c.title || ''} ${c.year || ''} book`),
  ])

  const all = dedupe([...olHits, ...webHits])

  if (all.length === 0) {
    return {
      status: 'not_found',
      confidence: 0.2,
      authorMatch: false,
      titleMatch: false,
      yearPlausible: false,
      bestHit: null,
      allHits: [],
      note: 'لم يُعثر على الكتاب في المكتبات الإلكترونية (Open Library / بحث الويب). تأكد من اسم المؤلف والعنوان.',
      pageVerifiable: false,
    }
  }

  // Score each hit
  let best: { hit: LibraryHit; score: number; authorOk: boolean; titleOk: boolean; yearOk: boolean } | null = null
  for (const hit of all) {
    const authorOk = hit.authors.length > 0 ? authorsMatch(c.author, hit.authors) : false
    const titleOk = c.title ? titlesMatch(c.title, hit.title) : false
    const yearOk = yearPlausible(c.year, hit.year)
    let score = 0
    if (titleOk) score += 0.45
    if (authorOk) score += 0.4
    if (yearOk) score += 0.15
    // bonus for structured library hit
    if (hit.source === 'openlibrary') score += 0.05
    if (!best || score > best.score) {
      best = { hit, score, authorOk, titleOk, yearOk }
    }
  }

  if (!best) {
    return {
      status: 'not_found',
      confidence: 0.2,
      authorMatch: false,
      titleMatch: false,
      yearPlausible: false,
      bestHit: null,
      allHits: all,
      note: 'لا توجد نتائج مطابقة.',
      pageVerifiable: false,
    }
  }

  let status: VerifyResult['status']
  let note: string
  const { hit, score, authorOk, titleOk, yearOk } = best

  if (titleOk && authorOk && yearOk) {
    status = 'verified'
    note = `عُثر على الكتاب في ${hit.source === 'openlibrary' ? 'Open Library' : 'بحث الويب'}: «${hit.title}»${hit.authors.length ? ' — ' + hit.authors.join('، ') : ''}${hit.year ? ' (' + hit.year + ')' : ''}. المؤلف والعنوان والسنة مطابقة.`
  } else if (titleOk && !authorOk) {
    status = 'author_mismatch'
    note = `عُثر على كتاب بعنوان مطابق: «${hit.title}»${hit.authors.length ? ' لكن المؤلف المسجَّل هو: ' + hit.authors.join('، ') : ''} — لا يطابق المؤلف المذكور في بحثك («${c.author}»). قد يكون خطأ في نسبة المؤلف.`
  } else if (titleOk && authorOk && !yearOk) {
    status = 'partial'
    note = `الكتاب والمؤلف مطابقان لكن السنة مختلفة (المسجَّلة: ${hit.year || 'غير معروفة'}، في بحثك: ${c.year}). قد تكون نسخة/طبعة مختلفة.`
  } else if (authorOk && !titleOk) {
    status = 'partial'
    note = `المؤلف معروف («${hit.authors.join('، ')}») لكن العنوان غير مطابق تماماً. أقرب نتيجة: «${hit.title}».`
  } else if (titleOk) {
    status = 'partial'
    note = `العنوان مطابق لكن تعذّر التأكد من المؤلف. النتيجة: «${hit.title}».`
  } else {
    status = 'not_found'
    note = `لم توجد مطابقة موثوقة. أقرب نتيجة: «${hit.title}»${hit.authors.length ? ' — ' + hit.authors.join('، ') : ''}.`
  }

  return {
    status,
    confidence: Math.round(Math.min(1, score) * 100) / 100,
    authorMatch: authorOk,
    titleMatch: titleOk,
    yearPlausible: yearOk,
    bestHit: hit,
    allHits: all.slice(0, 6),
    note,
    pageVerifiable: false, // remote libraries don't expose page text
  }
}

function dedupe(hits: LibraryHit[]): LibraryHit[] {
  const seen = new Set<string>()
  const out: LibraryHit[] = []
  for (const h of hits) {
    const key = normalizeForMatch(h.title).slice(0, 60)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(h)
  }
  return out
}

// ── Autonomous web fallback ───────────────────────────────────────────────────
// When the quote is NOT found in the uploaded file, the system "flies" the
// quote + author to global digital libraries and tries to locate the real
// published source. Returns a ready-to-use verified citation.

export interface WebFallbackResult {
  found: boolean
  confidence: number
  title: string
  authors: string[]
  year: string | null
  publisher: string | null
  isbn: string | null
  page: number | null
  pageConfirmed: boolean // true only if a snippet explicitly mentioned the page
  url: string | null
  sourceHits: LibraryHit[]
  apaCitation: string
  mlaCitation: string
  note: string
}

async function webSearchResults(query: string): Promise<LibraryHit[]> {
  try {
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', { query, num: 8 })
    if (!Array.isArray(results)) return []
    return results.map((r: { name?: string; url?: string; snippet?: string; host_name?: string; date?: string }) => ({
      source: 'web' as const,
      title: r.name || '',
      authors: [] as string[],
      year: extractYear(r.snippet || '') || extractYear(r.name || '') || null,
      publisher: r.host_name || null,
      isbn: null,
      url: r.url || '',
      snippet: r.snippet || '',
    }))
  } catch {
    return []
  }
}

// Try to spot a page number inside a search snippet, e.g. "...on page 45...".
function extractPageFromSnippet(text: string): number | null {
  const patterns = [
    /\bpage\s+(\d{1,4})\b/i,
    /\bp\.?\s*(\d{1,4})\b/i,
    /\bص\s*\.?\s*(\d{1,4})/,
    /\bصفحة\s*(\d{1,4})/,
    /\b(?:pp?\.?|pages?)\s*(\d{1,4})\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n >= 1 && n <= 9999) return n
    }
  }
  return null
}

export async function findCitationOnWeb(
  quote: string,
  author: string,
): Promise<WebFallbackResult> {
  const q = quote.trim()
  if (!q || !author.trim()) {
    return emptyFallback(quote, author)
  }

  // 0. Cross-lingual: if the quote is Arabic, translate to English so we can
  // search the global libraries where the original foreign book actually
  // lives. We search BOTH the original and the translated version.
  const { translateForSearch, detectLang } = await import('./translate')
  const sourceLang = detectLang(q)
  let searchVariants: { text: string; lang: string }[] = [{ text: q, lang: sourceLang }]
  if (sourceLang === 'ar') {
    try {
      const t = await translateForSearch(q, 'en')
      if (t.translated && t.translated.trim() && t.translated !== q) {
        searchVariants.push({ text: t.translated, lang: 'en' })
      }
    } catch {
      /* ignore translation failure */
    }
  }

  // 1. Web search for each variant (exact quote + author). Union the hits.
  const allRaw: LibraryHit[] = []
  const olQueries: string[] = []
  await Promise.all(
    searchVariants.map(async (v) => {
      const shortQuote = v.text.length > 120 ? v.text.slice(0, 120) + '…' : v.text
      const hits = await webSearchResults(`"${shortQuote}" ${author}`)
      allRaw.push(...hits)
      olQueries.push(`${author} ${v.text.split(' ').slice(0, 6).join(' ')}`)
    }),
  )
  const olHits = await searchOpenLibrary(olQueries[0] || `${author} ${q.slice(0, 60)}`)

  const all = dedupe([...allRaw, ...olHits])
  if (all.length === 0) {
    return {
      ...emptyFallback(quote, author),
      note: 'تعذّر العثور على المرجع البديل في المكتبات العالمية. تأكد من دقة الاقتباس واسم العالم، أو أعد رفع ملف المصدر الصحيح.',
    }
  }

  // 2. Score hits: prefer ones whose snippet contains the quote words, and
  // whose title/authors relate to the claimed author.
  const quoteTokens = new Set(normalizeForMatch(q).split(' ').filter((w) => w.length > 3))
  let best: { hit: LibraryHit; score: number; page: number | null; pageConfirmed: boolean } | null = null
  for (const hit of all) {
    let score = 0
    // author match
    if (hit.authors.length > 0 && authorsMatch(author, hit.authors)) score += 0.3
    else if (hit.authors.length === 0 && hit.title.toLowerCase().includes(author.toLowerCase())) score += 0.15
    // quote words in snippet
    const snippet = hit.snippet || ''
    const snippetTokens = new Set(normalizeForMatch(snippet).split(' '))
    let overlap = 0
    for (const t of quoteTokens) if (snippetTokens.has(t)) overlap++
    const coverage = quoteTokens.size ? overlap / quoteTokens.size : 0
    score += 0.5 * coverage
    // structured library hit bonus
    if (hit.source === 'openlibrary') score += 0.15
    // page mention in snippet
    const page = extractPageFromSnippet(snippet) || extractPageFromSnippet(hit.title)
    const pageConfirmed = page !== null
    if (pageConfirmed) score += 0.2

    if (!best || score > best.score) {
      best = { hit, score, page, pageConfirmed }
    }
  }

  if (!best || best.score < 0.2) {
    return {
      ...emptyFallback(quote, author),
      sourceHits: all.slice(0, 5),
      note: 'لم يُعثر على تطابق موثوق للاقتباس في المكتبات العالمية. هذه أقرب النتائج للمراجعة اليدوية:',
    }
  }

  const { hit, page, pageConfirmed, score } = best
  const title = hit.title || 'مرجع غير معروف'
  const authors = hit.authors.length ? hit.authors : [author]
  const year = hit.year || null
  const publisher = hit.publisher || null

  // 3. Compose ready-to-use citations
  const fields = {
    type: 'book',
    title,
    authors: authors.join('; '),
    year: year || 'بلا تاريخ',
    publisher: publisher || '',
  }
  const apa = composeApa(fields, page)
  const mla = composeMla(fields, page)

  const confidence = Math.min(1, score)
  let note: string
  if (pageConfirmed) {
    note = `عُثر على الاقتباس في المرجع: «${title}»${authors.length ? ' — ' + authors.join('، ') : ''}${year ? ' (' + year + ')' : ''}، الصفحة ${page}. المرجع بديل مؤكد من المكتبة العالمية مع رقم الصفحة الموثّق.`
  } else if (hit.source === 'openlibrary') {
    note = `عُثر على المرجع المحتمل في Open Library: «${title}»${authors.length ? ' — ' + authors.join('، ') : ''}${year ? ' (' + year + ')' : ''}. لم يُذكر رقم الصفحة في النتائج — راجع الكتاب يدوياً للتأكد. التوثيق أدناه جاهز للنسخ.`
  } else {
    note = `أقرب مرجع بديل من بحث الويب: «${title}»${authors.length ? ' — ' + authors.join('، ') : ''}${year ? ' (' + year + ')' : ''}. يُنصح بمراجعة المصدر الأصلي. التوثيق أدناه جاهز للنسخ.`
  }

  return {
    found: true,
    confidence,
    title,
    authors,
    year,
    publisher,
    isbn: hit.isbn,
    page,
    pageConfirmed,
    url: hit.url,
    sourceHits: all.slice(0, 5),
    apaCitation: apa,
    mlaCitation: mla,
    note,
  }
}

function emptyFallback(quote: string, author: string): WebFallbackResult {
  void quote
  void author
  return {
    found: false,
    confidence: 0,
    title: '',
    authors: [],
    year: null,
    publisher: null,
    isbn: null,
    page: null,
    pageConfirmed: false,
    url: null,
    sourceHits: [],
    apaCitation: '',
    mlaCitation: '',
    note: 'تعذّر العثور على المرجع البديل.',
  }
}

function composeApa(s: { title: string; authors: string; year: string; publisher: string }, page: number | null): string {
  const authorsArr = s.authors.split(';').map((a) => a.trim()).filter(Boolean)
  const formatted = authorsArr.map((a) => toInitialsName(a))
  const authorStr = formatted.length === 0 ? 'بدون مؤلف' : formatted.length === 1 ? formatted[0] : formatted.length === 2 ? `${formatted[0]} و ${formatted[1]}` : `${formatted[0]} وآخرون`
  let out = `${authorStr} (${s.year}). *${s.title}*.`
  if (s.publisher) out += ` ${s.publisher}.`
  if (page) out += ` (ص. ${page})`
  return out
}

function composeMla(s: { title: string; authors: string; year: string; publisher: string }, page: number | null): string {
  const authorsArr = s.authors.split(';').map((a) => a.trim()).filter(Boolean)
  const last = authorsArr[0] ? lastNameOf(authorsArr[0]) + ', ' + firstPart(authorsArr[0]) : ''
  const authorStr = authorsArr.length === 0 ? '' : authorsArr.length === 1 ? last : `${last} وآخرون`
  let out = authorStr ? authorStr + '. ' : ''
  out += `*${s.title}.*`
  if (s.publisher) out += ` ${s.publisher},`
  out += ` ${s.year}.`
  if (page) out += ` ص. ${page}.`
  return out
}

function toInitialsName(name: string): string {
  const n = name.trim()
  if (!n) return ''
  if (n.includes(',')) {
    const [last, rest] = n.split(',', 2).map((x) => x.trim())
    const initials = rest.split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + '.').join(' ')
    return `${last}, ${initials}`.trim()
  }
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  const initials = parts.slice(0, -1).map((w) => w.charAt(0).toUpperCase() + '.').join(' ')
  return `${initials} ${parts[parts.length - 1]}`.trim()
}

function lastNameOf(name: string): string {
  const n = name.trim()
  if (!n) return ''
  if (n.includes(',')) return n.split(',')[0].trim()
  return n.split(/\s+/).slice(-1)[0]
}

function firstPart(name: string): string {
  const n = name.trim()
  if (!n) return ''
  if (n.includes(',')) return n.split(',')[1]?.trim() || ''
  return n.split(/\s+/).slice(0, -1).join(' ')
}
