import { NextRequest, NextResponse } from 'next/server'
import { extractCitations } from '@/lib/research'

// POST { text: string } -> { citations: ExtractedCitation[] }
// Uses the LLM to pull every citation (author + year + title + page + quote)
// out of the pasted research draft.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const text = typeof body?.text === 'string' ? body.text : ''
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: 'النص فارغ.' }, { status: 400 })
    }
    if (text.length > 20000) {
      return NextResponse.json(
        { ok: false, error: 'النص طويل جداً (الحد 20000 حرف).' },
        { status: 400 },
      )
    }
    const citations = await extractCitations(text)
    return NextResponse.json({ ok: true, count: citations.length, citations })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'extract-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
