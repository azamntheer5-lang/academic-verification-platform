import { NextRequest, NextResponse } from 'next/server'
import { cleanBibliography } from '@/server/verify-engine/batch-cleaner'
import type { FormatStyle } from '@/server/verify-engine/models'

// POST { raw: string, style?: FormatStyle }
// Parses a pasted bibliography, runs each entry through the 3-layer library
// fallback, flags hallucinations, and returns real recommendations.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const raw = String(body?.raw || '')
    if (!raw.trim()) {
      return NextResponse.json({ ok: false, error: 'النص فارغ.' }, { status: 400 })
    }
    if (raw.length > 20000) {
      return NextResponse.json(
        { ok: false, error: 'النص طويل جداً (الحد 20000 حرف).' },
        { status: 400 },
      )
    }
    const style = (body?.style as FormatStyle) || 'apa7'
    const result = await cleanBibliography({ raw, style })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'clean-bibliography-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
