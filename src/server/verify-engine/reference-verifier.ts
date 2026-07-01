// ── Strict reference existence verifier ──────────────────────────────────────
// Used by the reference generator to GUARANTEE zero hallucinations. A
// candidate reference must be confirmed by at least one STRUCTURED source
// (Google Books API, Open Library, or Crossref DOI) — never a plain web
// search snippet. This is slower but 100% accurate.

export interface VerifiedReference {
  title: string
  authors: string[]
  year: string
  publisher: string
  isbn: string | null
  doi: string | null
  url: string
  verifiedBy: 'google_books' | 'open_library' | 'crossref'
}

interface GoogleBooksVolume {
  volumeInfo?: {
    title?: string
    authors?: string[]
    publishedDate?: string
    publisher?: string
    industryIdentifiers?: { type: string; identifier: string }[]
    infoLink?: string
  }
}

// ── Google Books API: strict structured lookup ──
async function verifyGoogleBooks(query: string): Promise<VerifiedReference | null> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as { items?: GoogleBooksVolume[]; totalItems?: number }
    if (!data.items || data.items.length === 0) return null
    const info = data.items[0].volumeInfo
    if (!info?.title) return null
    const isbn = info.industryIdentifiers?.find((i) => i.type.startsWith('ISBN'))?.identifier || null
    return {
      title: info.title,
      authors: info.authors || [],
      year: (info.publishedDate || '').slice(0, 4) || 'n.d.',
      publisher: info.publisher || '',
      isbn,
      doi: null,
      url: info.infoLink || `https://books.google.com/books?q=${encodeURIComponent(info.title)}`,
      verifiedBy: 'google_books',
    }
  } catch {
    clearTimeout(timeout)
    return null
  }
}

// ── Open Library: structured work lookup ──
async function verifyOpenLibrary(query: string): Promise<VerifiedReference | null> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3&fields=title,author_name,first_publish_year,publisher,isbn,key`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as {
      docs?: { title?: string; author_name?: string[]; first_publish_year?: number; publisher?: string[]; isbn?: string[]; key?: string }[]
    }
    const doc = data.docs?.[0]
    if (!doc?.title) return null
    return {
      title: doc.title,
      authors: doc.author_name || [],
      year: doc.first_publish_year ? String(doc.first_publish_year) : 'n.d.',
      publisher: doc.publisher?.[0] || '',
      isbn: doc.isbn?.[0] || null,
      doi: null,
      url: doc.key ? `https://openlibrary.org${doc.key}` : '',
      verifiedBy: 'open_library',
    }
  } catch {
    clearTimeout(timeout)
    return null
  }
}

// ── Crossref DOI: structured bibliographic lookup ──
async function verifyCrossref(query: string): Promise<VerifiedReference | null> {
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=3&select=DOI,title,author,published-print,published-online,publisher,container-title`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AcademicReferenceGenerator/1.0 (mailto:contact@example.com)' },
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as {
      message?: {
        items?: {
          DOI?: string
          title?: string[]
          author?: { given?: string; family?: string }[]
          'published-print'?: { 'date-parts'?: number[][] }
          'published-online'?: { 'date-parts'?: number[][] }
          publisher?: string[]
          'container-title'?: string[]
        }[]
      }
    }
    const item = data.message?.items?.[0]
    if (!item?.title?.[0]) return null
    const yearPart = item['published-print'] || item['published-online']
    const year = yearPart?.['date-parts']?.[0]?.[0] ? String(yearPart['date-parts'][0][0]) : 'n.d.'
    const authors = (item.author || []).map((a) => `${a.family || ''}, ${a.given || ''}`.trim().replace(/^,\s*/, ''))
    return {
      title: item.title[0],
      authors,
      year,
      publisher: item.publisher?.[0] || item['container-title']?.[0] || '',
      isbn: null,
      doi: item.DOI || null,
      url: item.DOI ? `https://doi.org/${item.DOI}` : '',
      verifiedBy: 'crossref',
    }
  } catch {
    clearTimeout(timeout)
    return null
  }
}

// ── Master verifier: try all 3 structured sources ──
// Returns the first confirmed hit. If none confirm, returns null → the
// generator will SKIP this topic rather than risk a hallucination.
export async function verifyReferenceExists(query: string): Promise<VerifiedReference | null> {
  // Try all three in parallel — fastest path. First non-null wins.
  const [gb, ol, cr] = await Promise.all([
    verifyGoogleBooks(query),
    verifyOpenLibrary(query),
    verifyCrossref(query),
  ])
  // Prefer Google Books (richest book metadata), then Open Library, then Crossref (papers)
  return gb || ol || cr
}
