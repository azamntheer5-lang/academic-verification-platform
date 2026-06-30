import { NextRequest, NextResponse } from 'next/server'
import { verifyCitationAgainstLibraries, type ExtractedCitation } from '@/lib/library'

// POST { references: ExtractedCitation[] }  (or { citations: [...] })
// Scans every reference in the list against real libraries. Returns:
//   - flagged: references that look hallucinated (not_found / author_mismatch)
//   - clean: references that verified
//   - suggestions: real alternatives for flagged refs (from search hits)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const refs = (body?.references || body?.citations || []) as ExtractedCitation[]
    if (!Array.isArray(refs) || refs.length === 0) {
      return NextResponse.json({ ok: false, error: 'لا توجد مراجع للمسح.' }, { status: 400 })
    }
    if (refs.length > 40) {
      return NextResponse.json({ ok: false, error: 'الحد الأقصى 40 مرجعاً لكل مسح.' }, { status: 400 })
    }

    // Verify each reference sequentially to be gentle on external APIs.
    const results = []
    for (const ref of refs) {
      const r = await verifyCitationAgainstLibraries({
        id: ref.id || `ref_${Date.now()}`,
        author: ref.author || '',
        year: ref.year || '',
        title: ref.title,
        page: ref.page ?? null,
        quote: ref.quote,
        context: ref.context,
      })
      const flagged = r.status === 'not_found' || r.status === 'author_mismatch'
      results.push({
        ref,
        status: r.status,
        confidence: r.confidence,
        authorMatch: r.authorMatch,
        titleMatch: r.titleMatch,
        yearPlausible: r.yearPlausible,
        note: r.note,
        bestHit: r.bestHit,
        allHits: r.allHits.slice(0, 3),
        flagged,
        suggestions: flagged ? r.allHits.slice(0, 3).map((h) => ({
          title: h.title,
          authors: h.authors,
          year: h.year,
          url: h.url,
          source: h.source,
        })) : [],
      })
    }

    return NextResponse.json({
      ok: true,
      total: results.length,
      flaggedCount: results.filter((r) => r.flagged).length,
      cleanCount: results.filter((r) => !r.flagged).length,
      results,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'hallucination-scan-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
