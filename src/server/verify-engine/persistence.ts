// ── Persistence layer: Prisma-backed audit logging ───────────────────────────
// Every verification (single or batch) is written to the database so the
// researcher can review their historical audits via /api/my-library.
//
// On Vercel serverless, SQLite (file-based) doesn't work because the
// filesystem is ephemeral. We detect this and gracefully degrade —
// verifications still work, they just aren't persisted. On a real Postgres
// DATABASE_URL (Neon/Supabase), persistence is fully active.

import { db } from '@/lib/db'

const ANON_EMAIL = 'researcher@local.academy'
const ANON_NAME = 'الباحث المحلي'
const DEFAULT_RESEARCH_TITLE = 'بحث غير معنون'

// Check if the database is available (Vercel SQLite = not available)
let dbAvailable: boolean | null = null
async function isDbAvailable(): Promise<boolean> {
  if (dbAvailable !== null) return dbAvailable
  try {
    await db.user.count({ take: 1 })
    dbAvailable = true
    return true
  } catch {
    dbAvailable = false
    return false
  }
}

async function ensureUser(): Promise<{ id: string; researchId: string } | null> {
  if (!(await isDbAvailable())) return null
  let user = await db.user.findUnique({ where: { email: ANON_EMAIL } })
  if (!user) {
    user = await db.user.create({ data: { email: ANON_EMAIL, name: ANON_NAME } })
  }
  let research = await db.research.findFirst({
    where: { userId: user.id, title: DEFAULT_RESEARCH_TITLE },
  })
  if (!research) {
    research = await db.research.create({
      data: { title: DEFAULT_RESEARCH_TITLE, userId: user.id },
    })
  }
  return { id: user.id, researchId: research.id }
}

export interface AuditRecord {
  citationId: string
  status: string
}

// Persist a single verification result. Gracefully no-ops on Vercel (SQLite).
export async function persistVerification(opts: {
  author: string
  quote: string
  expectedPage: string
  status: string
  printedPage: string | null
  alternative: {
    title: string
    author: string
    year: string
    publisher: string
    fullApa: string
  } | null
}): Promise<AuditRecord | null> {
  const ctx = await ensureUser()
  if (!ctx) return null // DB not available (Vercel) — skip persistence
  const { researchId } = ctx
  const { author, quote, expectedPage, status, printedPage, alternative } = opts

  const citation = await db.researchCitation.create({
    data: {
      researchId,
      authorInput: author,
      quoteInput: quote.slice(0, 2000),
      expectedPage: expectedPage || null,
      status,
      verifiedAuthor: alternative?.author || null,
      verifiedTitle: alternative?.title || null,
      verifiedYear: alternative?.year || null,
      verifiedPage: printedPage || null,
      verifiedPublisher: alternative?.publisher || null,
      fullApaCitation: alternative?.fullApa || null,
    },
  })

  await db.verificationResult.create({
    data: {
      citationId: citation.id,
      foundInFile: status === 'VERIFIED_EXACT' || status === 'VERIFIED_CORRECTED' || status === 'VERIFIED_SEMANTIC',
      foundInLibrary: status === 'ALTERNATIVE_FOUND',
      isHallucination: status === 'NOT_FOUND',
    },
  })

  return { citationId: citation.id, status }
}

// Persist a batch of clean-bibliography items.
export async function persistBatch(opts: {
  items: {
    raw: string
    parsedAuthor: string
    parsedYear: string
    parsedTitle: string
    status: string
    recommendation: { title: string; author: string; year: string; publisher: string; fullApa: string } | null
  }[]
}): Promise<{ saved: number } | null> {
  const ctx = await ensureUser()
  if (!ctx) return null // DB not available (Vercel)
  const { researchId } = ctx
  let saved = 0
  for (const item of opts.items) {
    const status =
      item.status === 'VERIFIED'
        ? 'VERIFIED_EXACT'
        : item.status === 'SUSPICIOUS_HALLUCINATION'
          ? 'HALLUCINATION'
          : 'NOT_FOUND'
    const citation = await db.researchCitation.create({
      data: {
        researchId,
        authorInput: item.parsedAuthor,
        quoteInput: item.parsedTitle.slice(0, 2000),
        expectedPage: null,
        status,
        verifiedAuthor: item.recommendation?.author || null,
        verifiedTitle: item.recommendation?.title || item.parsedTitle,
        verifiedYear: item.recommendation?.year || item.parsedYear || null,
        verifiedPublisher: item.recommendation?.publisher || null,
        fullApaCitation: item.recommendation?.fullApa || null,
      },
    })
    await db.verificationResult.create({
      data: {
        citationId: citation.id,
        foundInLibrary: item.status === 'VERIFIED',
        isHallucination: item.status === 'SUSPICIOUS_HALLUCINATION',
      },
    })
    saved++
  }
  return { saved }
}

// Fetch the user's library. Returns empty array on Vercel (no SQLite).
export async function fetchMyLibrary(): Promise<{
  citations: {
    id: string
    authorInput: string
    quoteInput: string
    expectedPage: string | null
    status: string
    verifiedAuthor: string | null
    verifiedTitle: string | null
    verifiedYear: string | null
    verifiedPage: string | null
    verifiedPublisher: string | null
    fullApaCitation: string | null
    createdAt: Date
    verification: { foundInFile: boolean; foundInLibrary: boolean; isHallucination: boolean } | null
  }[]
}> {
  const ctx = await ensureUser()
  if (!ctx) return { citations: [] } // DB not available
  const { researchId } = ctx
  const citations = await db.researchCitation.findMany({
    where: { researchId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { verification: true },
  })
  return { citations }
}
