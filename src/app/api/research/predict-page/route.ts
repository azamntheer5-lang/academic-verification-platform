import { NextRequest, NextResponse } from 'next/server'
import { predictPageRange } from '@/lib/predictive'

// POST { quote, author, title? }
// When the full text isn't available, predicts the chapter + page range from
// the book's Table of Contents in Open Library + LLM topic matching.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const quote = String(body?.quote || '').trim()
    const author = String(body?.author || '').trim()
    const title = body?.title ? String(body.title).trim() : undefined
    if (!quote || !author) {
      return NextResponse.json({ ok: false, error: 'الاقتباس والمؤلف مطلوبان.' }, { status: 400 })
    }
    const result = await predictPageRange(quote, author, title)
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'predict-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
