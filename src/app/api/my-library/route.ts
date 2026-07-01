import { NextResponse } from 'next/server'
import { fetchMyLibrary } from '@/server/verify-engine/persistence'
import { logError } from '@/server/verify-engine/server-utils'

// GET /api/my-library
// Returns the authenticated user's persisted verification audits (newest
// first), used to power the "مكتبتي" panel in the dashboard.
export async function GET() {
  try {
    const { citations } = await fetchMyLibrary()
    return NextResponse.json({
      ok: true,
      total: citations.length,
      verifiedCount: citations.filter((c) => c.status === 'VERIFIED_EXACT' || c.status === 'VERIFIED_CORRECTED' || c.status === 'VERIFIED_SEMANTIC' || c.status === 'ALTERNATIVE_FOUND').length,
      hallucinationCount: citations.filter((c) => c.status === 'HALLUCINATION' || c.status === 'NOT_FOUND').length,
      citations: citations.map((c) => ({
        id: c.id,
        author: c.authorInput,
        quote: c.quoteInput,
        expectedPage: c.expectedPage,
        status: c.status,
        verifiedAuthor: c.verifiedAuthor,
        verifiedTitle: c.verifiedTitle,
        verifiedYear: c.verifiedYear,
        verifiedPage: c.verifiedPage,
        verifiedPublisher: c.verifiedPublisher,
        fullApa: c.fullApaCitation,
        createdAt: c.createdAt.toISOString(),
        foundInFile: c.verification?.foundInFile || false,
        foundInLibrary: c.verification?.foundInLibrary || false,
        isHallucination: c.verification?.isHallucination || false,
      })),
    })
  } catch (e) {
    logError('my-library:GET', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'my-library-error' },
      { status: 500 },
    )
  }
}
