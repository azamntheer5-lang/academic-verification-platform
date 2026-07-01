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
  semanticMode?: boolean
  contextCheck?: ContextCheckResult
  contextChecking?: boolean
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
  realPage: number | null
  matchScore: number
  exactMatch: boolean
  snippet: string
  note: string
  searchedPages: number
  candidates: { page: number; score: number }[]
  fallback?: WebFallbackResult | null
  fallbackSearching?: boolean
  predicted?: PredictivePageResult | null
}

// Autonomous web fallback: when the quote is NOT found in the uploaded file,
// the system searches global libraries for the real source and composes a
// ready-to-use citation.
export interface WebFallbackResult {
  found: boolean
  confidence: number
  title: string
  authors: string[]
  year: string | null
  publisher: string | null
  isbn: string | null
  page: number | null
  pageConfirmed: boolean
  url: string | null
  sourceHits: LibraryHit[]
  apaCitation: string
  mlaCitation: string
  note: string
}

// A source file uploaded and parsed into pages, kept in-memory per citation
export interface SourceFile {
  id: string
  name: string
  kind: 'pdf' | 'docx'
  total: number
  pages: { number: number; text: string }[]
}

// Contextual integrity check (feature 4)
export interface ContextCheckResult {
  faithful: boolean
  severity: 'ok' | 'warning' | 'critical'
  note: string
  authorIntent: string
}

// Hallucination scan result (feature 3)
export interface HallucinationItem {
  ref: ExtractedCitation
  status: 'verified' | 'author_mismatch' | 'not_found' | 'partial' | 'error'
  confidence: number
  authorMatch: boolean
  titleMatch: boolean
  yearPlausible: boolean
  note: string
  bestHit: LibraryHit | null
  allHits: LibraryHit[]
  flagged: boolean
  suggestions: { title: string; authors: string[]; year: string | null; url: string; source: string }[]
}

// Export formats (feature 5)
export type ExportFormat = 'bibtex' | 'ris'

// Integrity (M6) — retracted/predatory
export interface IntegrityResult {
  retracted: boolean
  retractionReason: string | null
  retractionDate: string | null
  retractionUrl: string | null
  predatory: boolean
  predatoryNote: string | null
  originalDoi: string | null
  note: string
}

// Bias report (M9)
export interface BiasReport {
  total: number
  recency: { score: number; buckets: { range: string; count: number }[]; oldCount: number; recentCount: number; note: string; severity: 'ok' | 'warning' | 'critical' }
  authorConcentration: { topAuthors: { author: string; count: number; pct: number }[]; maxPct: number; note: string; severity: 'ok' | 'warning' | 'critical' }
  sourceDiversity: { types: { type: string; count: number; pct: number }[]; note: string; severity: 'ok' | 'warning' | 'critical' }
  languageDiversity: { ar: number; en: number; other: number; note: string; severity: 'ok' | 'warning' | 'critical' }
  overallNote: string
  overallSeverity: 'ok' | 'warning' | 'critical'
}

// Predictive page (M10)
export interface PredictivePageResult {
  available: boolean
  chapter: string | null
  pageRange: string | null
  toc: { title: string; page?: string }[]
  note: string
  confidence: number
}

// University guideline (M8)
export interface GuidelineRules {
  name: string
  rulesText: string
  examples: { input: string; output: string }[]
  rawExtract: string
}

// Reference network (M7)
export interface GraphNode {
  id: string
  label: string
  author: string
  year?: string
  type: 'cited' | 'suggested'
  weight: number
}
export interface GraphEdge {
  source: string
  target: string
  relation: 'cites' | 'co_cite' | 'suggests'
  weight: number
  evidence?: string
}
export interface ReferenceGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  suggestions: { author: string; reason: string }[]
}
