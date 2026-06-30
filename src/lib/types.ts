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
  pageVerify?: PageVerifyResult
  sourceFileId?: string | null
  pageVerifying?: boolean
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

// Page-level verification result (from uploaded PDF/DOCX source file)
export interface PageVerifyResult {
  status: 'verified' | 'wrong_page' | 'not_found' | 'no_quote' | 'pending'
  confidence: number
  claimedPage: number | null
  matchedPage: number | null
  matchScore: number
  exactMatch: boolean
  snippet: string
  note: string
  searchedPages: number
  candidates: { page: number; score: number }[]
}

// A source file uploaded and parsed into pages, kept in-memory per citation
export interface SourceFile {
  id: string
  name: string
  kind: 'pdf' | 'docx'
  total: number
  pages: { number: number; text: string }[]
}
