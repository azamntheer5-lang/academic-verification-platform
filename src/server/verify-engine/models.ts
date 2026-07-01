// ── Verify Engine: domain models ─────────────────────────────────────────────
// Shared contract between the backend service and the API route. Mirrors the
// Python reference in backend/main.py.

export type VerifyStatus =
  | 'VERIFIED_EXACT' // quote found in file, page matches
  | 'VERIFIED_CORRECTED' // quote found in file, page corrected
  | 'VERIFIED_SEMANTIC' // paraphrase match — same meaning, different words
  | 'ALTERNATIVE_FOUND' // quote not in file, found in global library
  | 'NOT_FOUND' // not in file, not in library
  | 'ERROR'

export interface AlternativeReference {
  title: string
  author: string
  year: string
  publisher: string
  fullApa: string
}

export interface VerifyResponse {
  status: VerifyStatus
  message: string
  page: string | null
  alternative: AlternativeReference | null
}

export interface VerifyRequest {
  author: string
  quote: string
  expectedPage: string
}

// ── Batch bibliography cleaner (Module 2) ────────────────────────────────────
export type CleanItemStatus =
  | 'VERIFIED' // found in a real library
  | 'SUSPICIOUS_HALLUCINATION' // not found in any layer → likely fake
  | 'ERROR'

export interface CleanItem {
  raw: string // original line as pasted
  parsedAuthor: string
  parsedYear: string
  parsedTitle: string
  status: CleanItemStatus
  matchedSource: 'google_books' | 'open_library' | 'web_search' | null
  matchUrl: string | null
  recommendation: AlternativeReference | null // 100% real alternative
  note: string
}

export interface CleanResponse {
  total: number
  verifiedCount: number
  suspiciousCount: number
  items: CleanItem[]
}

// ── Format styles (Module 3) ─────────────────────────────────────────────────
export type FormatStyle =
  | 'apa7'
  | 'mla9'
  | 'chicago'
  | 'harvard'
  | 'ksu' // King Saud University
  | 'cairo' // Cairo University
