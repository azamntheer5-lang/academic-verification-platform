import { NextRequest, NextResponse } from 'next/server'
import { checkIntegrity } from '@/lib/integrity'

// POST { title, author, journal?, publisher?, doi? }
// Checks retraction (Crossref + web) and predatory-journal signals.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const title = String(body?.title || '').trim()
    const author = String(body?.author || '').trim()
    if (!title && !author) {
      return NextResponse.json({ ok: false, error: 'العنوان أو المؤلف مطلوب.' }, { status: 400 })
    }
    const result = await checkIntegrity({
      title,
      author,
      journal: body?.journal || null,
      publisher: body?.publisher || null,
      doi: body?.doi || null,
    })
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'integrity-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
