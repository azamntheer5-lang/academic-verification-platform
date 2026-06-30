// M10 — Predictive page-missing solver.
// When the book is not available online (no full text, no page found), we
// narrow down the page range using the book's Table of Contents from Open
// Library / Library of Congress, plus an LLM that maps the quote's topic to
// the most likely chapter.

import ZAI from 'z-ai-web-dev-sdk'

export interface PredictivePageResult {
  available: boolean
  chapter: string | null
  pageRange: string | null // e.g. "65-88"
  toc: { title: string; page?: string }[]
  note: string
  confidence: number
}

interface OpenLibraryWork {
  title?: string
  subjects?: string[]
  table_of_contents?: { title?: string; level?: number; label?: string; pagenum?: string }[] | string[]
}

async function fetchOpenLibraryTOC(query: string): Promise<{ toc: { title: string; page?: string }[]; url: string | null; workKey: string | null; subjects: string[] }> {
  try {
    const searchUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3&fields=title,author_name,key,editions`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)
    const res = await fetch(searchUrl, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return { toc: [], url: null, workKey: null, subjects: [] }
    const data = await res.json()
    const doc = data?.docs?.[0]
    if (!doc?.key) return { toc: [], url: null, workKey: null, subjects: [] }
    const workKey = doc.key as string

    const workRes = await fetch(`https://openlibrary.org${workKey}.json`)
    if (!workRes.ok) return { toc: [], url: `https://openlibrary.org${workKey}`, workKey, subjects: [] }
    const work = (await workRes.json()) as OpenLibraryWork
    const rawToc = work.table_of_contents || []
    const toc: { title: string; page?: string }[] = []
    for (const item of rawToc) {
      if (typeof item === 'string') {
        toc.push({ title: item })
      } else if (item && typeof item === 'object') {
        toc.push({ title: String(item.title || item.label || ''), page: item.pagenum ? String(item.pagenum) : undefined })
      }
    }
    const subjects = (work.subjects || []).slice(0, 8)
    return { toc, url: `https://openlibrary.org${workKey}`, workKey, subjects }
  } catch {
    return { toc: [], url: null, workKey: null, subjects: [] }
  }
}

// Fallback: search the web for the book's Table of Contents. Many book
// listings (publisher pages, library catalogs, Google Books previews) expose
// chapter titles + page numbers.
async function fetchTOCFromWeb(
  title: string,
  author: string,
): Promise<{ toc: { title: string; page?: string }[]; source: string | null }> {
  try {
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', {
      query: `"${title}" ${author} table of contents chapters pages`,
      num: 6,
    })
    if (!Array.isArray(results)) return { toc: [], source: null }
    const toc: { title: string; page?: string }[] = []
    for (const r of results as { snippet?: string; name?: string; url?: string }[]) {
      const text = `${r.name || ''} ${r.snippet || ''}`
      // look for "Chapter X: Title" or "X. Title ... p. NN" patterns
      const chapterMatches = text.match(/(?:chapter\s+\d+|الفصل\s+\d+|\d+\.)\s*[:\-]?\s*([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s,:'"\-]{4,60})/gi)
      if (chapterMatches) {
        for (const m of chapterMatches.slice(0, 8)) {
          const title2 = m.replace(/^(chapter\s+\d+|الفصل\s+\d+|\d+\.)\s*[:\-]?\s*/i, '').trim()
          if (title2.length > 3) toc.push({ title: title2 })
        }
        if (toc.length >= 3) return { toc, source: r.url || null }
      }
    }
    return { toc: toc.slice(0, 8), source: null }
  } catch {
    return { toc: [], source: null }
  }
}

async function predictChapter(quote: string, toc: { title: string; page?: string }[]): Promise<{ chapter: string | null; note: string; confidence: number }> {
  if (toc.length === 0) {
    return { chapter: null, note: 'تعذّر العثور على فهرس الكتاب الرسمي.', confidence: 0 }
  }
  try {
    const zai = await ZAI.create()
    const tocText = toc.map((t, i) => `${i + 1}. ${t.title}${t.page ? ` (ص ${t.page})` : ''}`).join('\n')
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `أنت خبير أكاديمي. لديك فهرس كتاب ونص اقتباس. مهمتك: حدد الفصل الأقرب موضوعياً للاقتباس. أعد JSON صارم فقط: {"chapter": "عنوان الفصل الأقرب كما ورد في الفهرس", "confidence": 0.0-1.0, "reason": "سبب قصير بالعربية"}. لا تكتب شيئاً خارج JSON.`,
        },
        {
          role: 'user',
          content: `=== فهرس الكتاب ===\n${tocText}\n\n=== نص الاقتباس ===\n${quote.slice(0, 800)}`,
        },
      ],
      thinking: { type: 'disabled' },
    })
    const raw = completion.choices[0]?.message?.content || ''
    const parsed = parseJsonLoose(raw)
    if (!parsed) return { chapter: null, note: 'تعذّر تحليل الفهرس.', confidence: 0 }
    return {
      chapter: String(parsed.chapter || ''),
      note: String(parsed.reason || ''),
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    }
  } catch {
    return { chapter: null, note: 'تعذّر تحليل الفهرس.', confidence: 0 }
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

export async function predictPageRange(
  quote: string,
  author: string,
  title?: string,
): Promise<PredictivePageResult> {
  const query = `${author} ${title || ''}`.trim()
  if (!query) {
    return { available: false, chapter: null, pageRange: null, toc: [], note: 'بيانات غير كافية.', confidence: 0 }
  }

  const ol = await fetchOpenLibraryTOC(query)
  let toc = ol.toc
  let sourceUrl = ol.url

  // Fallback: web search for the TOC if Open Library has none
  if (toc.length === 0 && title) {
    const web = await fetchTOCFromWeb(title, author)
    if (web.toc.length > 0) {
      toc = web.toc
      if (web.source) sourceUrl = web.source
    }
  }

  if (toc.length === 0) {
    // Last resort: use subjects as a pseudo-TOC if available
    if (ol.subjects.length > 0) {
      const subjToc = ol.subjects.map((s) => ({ title: s }))
      const pred = await predictChapter(quote, subjToc)
      return {
        available: true,
        chapter: pred.chapter,
        pageRange: null,
        toc: subjToc,
        note: `لم يتوفر فهرس تفصيلي، لكن بالاعتماد على موضوعات الكتاب في Open Library، فإن الموضوع الأقرب هو «${pred.chapter}». ثقة ${Math.round(pred.confidence * 100)}%. راجع الكتاب في نطاق هذا الموضوع.`,
        confidence: pred.confidence * 0.6,
      }
    }
    return {
      available: false,
      chapter: null,
      pageRange: null,
      toc: [],
      note: `تعذّر العثور على فهرس الكتاب «${title || query}» في المكتبات الرقمية. قد يكون الكتاب مطبوعاً قديماً غير مُرقمن.`,
      confidence: 0,
    }
  }

  const pred = await predictChapter(quote, toc)

  // Try to derive a page range from the matched chapter and the next chapter
  let pageRange: string | null = null
  if (pred.chapter) {
    const idx = toc.findIndex((t) => t.title === pred.chapter)
    if (idx !== -1) {
      const startPage = toc[idx].page
      const endPage = idx + 1 < toc.length ? toc[idx + 1].page : undefined
      if (startPage) {
        pageRange = endPage ? `${startPage}-${endPage}` : `من ص. ${startPage}`
      } else if (toc[idx + 1]?.page) {
        pageRange = `حتى ص. ${toc[idx + 1].page}`
      }
    }
  }

  const note = pageRange
    ? `لم يتوفر النص الكامل، لكن بالاعتماد على فهرس الكتاب الرسمي${sourceUrl ? ` (المصدر: ${sourceUrl})` : ''}، فإن هذا الاقتباس يقع حتماً في الفصل «${pred.chapter}» بين الصفحات (${pageRange}). يُضيق هذا دائرة البحث اليدوي بشكل كبير.`
    : pred.chapter
      ? `لم يتوفر النص الكامل، لكن الفصل الأقرب موضوعياً هو «${pred.chapter}» (ثقة ${Math.round(pred.confidence * 100)}%). راجع هذا الفصل يدوياً.`
      : `تعذّر تحديد الفصل بدقة. راجع فهرس الكتاب يدوياً.`

  return {
    available: true,
    chapter: pred.chapter,
    pageRange,
    toc,
    note,
    confidence: pred.confidence,
  }
}
