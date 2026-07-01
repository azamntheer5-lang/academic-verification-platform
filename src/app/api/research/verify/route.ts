import { NextRequest, NextResponse } from 'next/server'
import { verifyCitationAgainstLibraries, type ExtractedCitation } from '@/lib/library'

// POST { citation: ExtractedCitation } -> VerifyResult
// Looks the citation up in Open Library + web search and returns whether the
// author / title / year actually match a real published book.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const citation = body?.citation as Partial<ExtractedCitation> | undefined
    if (!citation || (!citation.author && !citation.title)) {
      return NextResponse.json(
        { ok: false, error: 'بيانات التوثيق ناقصة (لا يوجد مؤلف أو عنوان).' },
        { status: 400 },
      )
    }
    const result = await verifyCitationAgainstLibraries({
      id: citation.id || `cit_${Date.now()}`,
      author: citation.author || '',
      year: citation.year || '',
      title: citation.title,
      page: citation.page ?? null,
      quote: citation.quote,
      context: citation.context,
    })
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'verify-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
