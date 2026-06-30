// ── Verify Engine: global library fallback ───────────────────────────────────
// Stage 2 of the hybrid engine. When the quote is not found in the uploaded
// file, we query global digital libraries. Sources tried in order:
//   1. Google Books API (strict "quote" inauthor:author) — may rate-limit
//   2. Open Library search (free, structured metadata)
//   3. z-ai web_search (broadest coverage, snippets often contain the quote)

import { formatApa7 } from './apa-formatter'
import type { AlternativeReference } from './models'

interface GoogleBooksVolume {
  volumeInfo?: {
    title?: string
    authors?: string[]
    publishedDate?: string
    publisher?: string
  }
}

// Strict Google Books search: "exact quote" inauthor:author
async function queryGoogleBooks(quote: string, author: string): Promise<AlternativeReference | null> {
  const shortQuote = quote.length > 120 ? quote.slice(0, 120) : quote
  const q = `"${shortQuote}" inauthor:${author}`
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null // 429/5xx → fall through to next source
    const data = (await res.json()) as { items?: GoogleBooksVolume[] }
    const items = data.items || []
    if (items.length === 0) return null
    const info = items[0].volumeInfo || {}
    const title = info.title || ''
    const authors = info.authors || []
    const year = (info.publishedDate || '').slice(0, 4)
    const publisher = info.publisher || ''
    if (!title) return null
    return {
      title,
      author: authors.join(', ') || author,
      year: year || 'n.d.',
      publisher,
      fullApa: formatApa7(title, authors, year || 'n.d.', publisher),
    }
  } catch {
    clearTimeout(timeout)
    return null
  }
}

// Fallback: Open Library search by author + first words of quote
async function queryOpenLibrary(quote: string, author: string): Promise<AlternativeReference | null> {
  const shortQuote = quote.split(' ').slice(0, 6).join(' ')
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(`${author} ${shortQuote}`)}&limit=3&fields=title,author_name,first_publish_year,publisher`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as { docs?: { title?: string; author_name?: string[]; first_publish_year?: number; publisher?: string[] }[] }
    const doc = data.docs?.[0]
    if (!doc?.title) return null
    const authors = doc.author_name || []
    const year = doc.first_publish_year ? String(doc.first_publish_year) : 'n.d.'
    const publisher = doc.publisher?.[0] || ''
    return {
      title: doc.title,
      author: authors.join(', ') || author,
      year,
      publisher,
      fullApa: formatApa7(doc.title, authors, year, publisher),
    }
  } catch {
    clearTimeout(timeout)
    return null
  }
}

// Fallback 3: z-ai web_search — broadest. Returns the top result whose
// snippet mentions the quote, formatted as an AlternativeReference.
async function queryWebSearch(quote: string, author: string): Promise<AlternativeReference | null> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const shortQuote = quote.length > 120 ? quote.slice(0, 120) + '…' : quote
    const results = await zai.functions.invoke('web_search', {
      query: `"${shortQuote}" ${author}`,
      num: 6,
    })
    if (!Array.isArray(results)) return null
    const qTokens = new Set(
      quote
        .toLowerCase()
        .replace(/[«»"“”‘’`(){}\[\],;:!?؟.,\-–—_]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    )
    for (const r of results as { name?: string; url?: string; snippet?: string; host_name?: string; date?: string }[]) {
      const text = `${r.name || ''} ${r.snippet || ''}`
      const tTokens = new Set(text.toLowerCase().split(/\s+/))
      let overlap = 0
      for (const t of qTokens) if (tTokens.has(t)) overlap++
      const coverage = qTokens.size ? overlap / qTokens.size : 0
      if (coverage < 0.4) continue
      const year = (text.match(/\b(1[6-9]\d{2}|20\d{2})\b/) || [])[1] || 'n.d.'
      return {
        title: r.name || 'مرجع من الويب',
        author,
        year,
        publisher: r.host_name || '',
        fullApa: formatApa7(r.name || 'مرجع من الويب', [author], year, r.host_name || ''),
      }
    }
    return null
  } catch {
    return null
  }
}

export async function findInGlobalLibrary(quote: string, author: string): Promise<AlternativeReference | null> {
  // Try Google Books (strict) → Open Library (structured) → web search (broad)
  const gb = await queryGoogleBooks(quote, author)
  if (gb) return gb
  const ol = await queryOpenLibrary(quote, author)
  if (ol) return ol
  const ws = await queryWebSearch(quote, author)
  return ws
}
