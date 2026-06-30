// Shared client-side types mirroring the server API contracts.

export interface ExtractedCitation {
  id: string
  author: string
  year: string
  title?: string
  page?: number | null
  quote?: string
  context?: string
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

export type VerifyStatus = 'verified' | 'author_mismatch' | 'not_found' | 'partial' | 'error' | 'pending'

export interface VerifyResult {
  status: Exclude<VerifyStatus, 'pending'>
  confidence: number
  authorMatch: boolean
  titleMatch: boolean
  yearPlausible: boolean
  bestHit: LibraryHit | null
  allHits: LibraryHit[]
  note: string
  pageVerifiable: boolean
}

export interface CitationRow extends ExtractedCitation {
  status: VerifyStatus
  result?: VerifyResult
  verifying: boolean
}

export interface SavedSource {
  id: string
  type: string
  title: string
  authors: string
  year: string
  publisher?: string | null
  city?: string | null
  edition?: string | null
  journal?: string | null
  volume?: string | null
  issue?: string | null
  pagesRange?: string | null
  url?: string | null
  doi?: string | null
  language?: string | null
  note?: string | null
  createdAt: string
  _count?: { citations: number; pages: number }
}
