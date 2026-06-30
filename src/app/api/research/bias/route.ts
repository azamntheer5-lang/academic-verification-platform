import { NextRequest, NextResponse } from 'next/server'
import { analyzeBias } from '@/lib/bias'

// POST { citations: [{ author, year, title, type }] }
// Returns a full bias/balance report (recency, author concentration, diversity).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const citations = Array.isArray(body?.citations) ? body.citations : []
    if (citations.length === 0) {
      return NextResponse.json({ ok: false, error: 'لا توجد اقتباسات للتحليل.' }, { status: 400 })
    }
    const report = analyzeBias(citations)
    return NextResponse.json({ ok: true, report })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'bias-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
