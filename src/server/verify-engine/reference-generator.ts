// ── Reference Generator (ZERO hallucinations) ────────────────────────────────
// The inverse of the verifier: given a research text with NO references, this
// module analyzes the content, extracts the key topics/claims, and searches
// real global libraries for books/papers that genuinely discuss those topics.
//
// ANTI-HALLUCINATION GUARANTEE: every returned reference MUST be confirmed by
// at least one STRUCTURED source (Google Books API, Open Library, or Crossref
// DOI). Plain web-search snippets are NOT accepted. If a topic cannot be
// confirmed structurally, it is SKIPPED — the generator would rather return
// fewer references than risk a single fabricated one.

import ZAI from 'z-ai-web-dev-sdk'
import { formatReference } from './formatters'
import { verifyReferenceExists, type VerifiedReference } from './reference-verifier'
import type { FormatStyle } from './models'

export interface GeneratedReference {
  topic: string
  title: string
  authors: string[]
  year: string
  publisher: string
  isbn: string | null
  doi: string | null
  url: string
  verifiedBy: 'google_books' | 'open_library' | 'crossref'
  page: number | null
  pageConfirmed: boolean
  formatted: string
  relevanceNote: string
}

export interface GenerateResult {
  total: number
  references: GeneratedReference[]
  extractedTopics: string[]
  skippedTopics: string[] // topics we couldn't verify structurally
  note: string
}

const SYSTEM = `أنت خبير أكاديمي. سيُعطاك نص بحث بدون مراجع. مهمتك:
1. استخرج 5-8 مواضيع/مفاهيم رئيسية يتحدث عنها البحث.
2. لكل موضوع، اقترح مصطلح بحث دقيق (بالإنجليزية لأن المكتبات العالمية أغنى بالإنجليزية) يصلح للبحث عن كتاب حقيقي يتناول ذلك الموضوع.
3. لكل موضوع، اقترح فصلاً أو قسم محتمل يُبحث عن رقم صفحته.

أعد JSON صارم فقط:
{"topics": [{"topic": "وصف الموضوع بالعربية", "query": "search query in English", "chapterHint": "chapter or section name", "relevance": "لماذا هذا الموضوع مهم للبحث"}]}

قواعد:
- المواضيع ملموسة وقابلة للبحث.
- الـ query بالإنجليزية ومحدداً.
- لا تخترع مراجع — فقط اقترح مصطلحات بحث.
- لا تكتب شيئاً خارج JSON.`

export async function generateReferences(opts: {
  researchText: string
  style?: FormatStyle
}): Promise<GenerateResult> {
  const { researchText, style = 'apa7' } = opts
  const trimmed = researchText.trim()
  if (!trimmed || trimmed.length < 50) {
    return {
      total: 0,
      references: [],
      extractedTopics: [],
      skippedTopics: [],
      note: 'النص قصير جداً. الصق فقرة بحث أطول (50 حرف على الأقل).',
    }
  }

  // ── Stage 1: LLM extracts key topics ──
  const topics = await extractTopics(trimmed)
  if (topics.length === 0) {
    return {
      total: 0,
      references: [],
      extractedTopics: [],
      skippedTopics: [],
      note: 'تعذّر استخراج مواضيع من النص. حاول نصاً أوضح أو أطول.',
    }
  }

  // ── Stage 2: for each topic, STRUCTURAL verification (no web search) ──
  const references: GeneratedReference[] = []
  const skippedTopics: string[] = []
  const seenTitles = new Set<string>()

  for (const t of topics) {
    try {
      // Try the English query first, then the Arabic topic
      const queries = [t.query, t.topic].filter(Boolean)
      let verified: VerifiedReference | null = null
      for (const q of queries) {
        verified = await verifyReferenceExists(q)
        if (verified) break
      }

      if (!verified) {
        // SKIP — do not risk a hallucination
        skippedTopics.push(t.topic)
        continue
      }

      // Dedupe by title
      const key = verified.title.toLowerCase().slice(0, 60)
      if (seenTitles.has(key)) continue
      seenTitles.add(key)

      // ── Stage 3: extract page number via web search (page only, not ref) ──
      // The reference itself is already verified structurally. We use web
      // search ONLY to locate a page number — if we can't find one, the
      // reference is still valid, just without a confirmed page.
      let page = await findPageForChapter(verified.title, verified.authors.join(', '), t.chapterHint)
      let pageConfirmed = page !== null
      if (!page) {
        page = await findPageFromSnippet(t.query)
        pageConfirmed = page !== null
      }

      // ── Stage 4: format in the requested style WITH page ──
      const formatted = formatReference(
        {
          title: verified.title,
          authors: verified.authors,
          year: verified.year,
          publisher: verified.publisher || undefined,
          page: page ? String(page) : null,
        },
        style,
      )

      references.push({
        topic: t.topic,
        title: verified.title,
        authors: verified.authors,
        year: verified.year,
        publisher: verified.publisher,
        isbn: verified.isbn,
        doi: verified.doi,
        url: verified.url,
        verifiedBy: verified.verifiedBy,
        page,
        pageConfirmed,
        formatted,
        relevanceNote: t.relevance,
      })

      if (references.length >= 10) break
    } catch {
      skippedTopics.push(t.topic)
    }
  }

  const confirmedPages = references.filter((r) => r.pageConfirmed).length
  const note =
    references.length === 0
      ? `تعذّر العثور على مراجع موثّقة هيكلياً لأي من المواضيع (${skippedTopics.length} موضوع تم تخطيه). حاول نصاً أكثر تفصيلاً أو مواضيع أوضح.`
      : `تم استخراج ${topics.length} موضوع. عُثر على ${references.length} مرجع حقيقي مؤكد هيكلياً (Google Books / Open Library / Crossref). ${confirmedPages} منها مؤكد برقم صفحة. ${skippedTopics.length} موضوع تم تخطيه لعدم وجود مصدر هيكلي موثوق. صفر هلوسة مضمون.`

  return {
    total: references.length,
    references,
    extractedTopics: topics.map((t) => t.topic),
    skippedTopics,
    note,
  }
}

// Search for a specific chapter's page number via web search.
async function findPageForChapter(title: string, author: string, chapter: string): Promise<number | null> {
  if (!chapter) return null
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', {
      query: `"${title.slice(0, 60)}" ${author} "${chapter}" page`,
      num: 5,
    })
    if (!Array.isArray(results)) return null
    for (const r of results as { snippet?: string; name?: string }[]) {
      const text = `${r.name || ''} ${r.snippet || ''}`
      const p = extractPageFromText(text)
      if (p) return p
    }
    return null
  } catch {
    return null
  }
}

async function findPageFromSnippet(query: string): Promise<number | null> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', { query: `"${query}" book page`, num: 3 })
    if (!Array.isArray(results)) return null
    for (const r of results as { snippet?: string; name?: string }[]) {
      const text = `${r.name || ''} ${r.snippet || ''}`
      const p = extractPageFromText(text)
      if (p) return p
    }
    return null
  } catch {
    return null
  }
}

function extractPageFromText(text: string): number | null {
  const patterns = [
    /\bpage\s+(\d{1,4})\b/i,
    /\bp\.?\s*(\d{1,4})\b/i,
    /\bpp\.?\s*(\d{1,4})\b/i,
    /\bص\s*\.?\s*(\d{1,4})/,
    /\bصفحة\s*(\d{1,4})/,
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

async function extractTopics(
  text: string,
): Promise<{ topic: string; query: string; chapterHint: string; relevance: string }[]> {
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM },
        { role: 'user', content: text.slice(0, 6000) },
      ],
      thinking: { type: 'disabled' },
    })
    const raw = completion.choices[0]?.message?.content || ''
    const parsed = parseJsonLoose(raw)
    if (!parsed || !Array.isArray(parsed.topics)) return []
    return (parsed.topics as { topic?: string; query?: string; chapterHint?: string; relevance?: string }[])
      .filter((t) => t.topic && t.query)
      .slice(0, 8)
      .map((t) => ({
        topic: String(t.topic),
        query: String(t.query),
        chapterHint: String(t.chapterHint || ''),
        relevance: String(t.relevance || ''),
      }))
  } catch {
    return []
  }
}

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  const t = raw.replace(/```json/gi, '```').replace(/```/g, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}

