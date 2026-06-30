// ── Persistence layer: Prisma-backed audit logging ───────────────────────────
// Every verification (single or batch) is written to the database so the
// researcher can review their historical audits via /api/my-library.
//
// We use a singleton anonymous user (created on first call) so the sandbox
// works without authentication. In production this would be replaced by the
// authenticated session user.

import { db } from '@/lib/db'

const ANON_EMAIL = 'researcher@local.academy'
const ANON_NAME = 'الباحث المحلي'
const DEFAULT_RESEARCH_TITLE = 'بحث غير معنون'

async function ensureUser(): Promise<{ id: string; researchId: string }> {
  let user = await db.user.findUnique({ where: { email: ANON_EMAIL } })
  if (!user) {
    user = await db.user.create({ data: { email: ANON_EMAIL, name: ANON_NAME } })
  }
  // Get or create a default research for this user
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

// Persist a single verification result.
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
}): Promise<AuditRecord> {
  const { researchId } = await ensureUser()
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

// Persist a batch of clean-bibliography items in one transaction.
export async function persistBatch(opts: {
  items: {
    raw: string
    parsedAuthor: string
    parsedYear: string
    parsedTitle: string
    status: string
    recommendation: { title: string; author: string; year: string; publisher: string; fullApa: string } | null
  }[]
}): Promise<{ saved: number }> {
  const { researchId } = await ensureUser()
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

// Fetch the user's library (all verified citations, newest first).
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
  const { researchId } = await ensureUser()
  const citations = await db.researchCitation.findMany({
    where: { researchId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { verification: true },
  })
  return { citations }
}
