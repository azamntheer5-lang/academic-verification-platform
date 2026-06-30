// ── Verify Engine: domain models ─────────────────────────────────────────────
// Shared contract between the backend service and the API route. Mirrors the
// Python reference in backend/main.py.

export type VerifyStatus =
  | 'VERIFIED_EXACT' // quote found in file, page matches
  | 'VERIFIED_CORRECTED' // quote found in file, page corrected
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
