import { NextRequest, NextResponse } from 'next/server'
import { cleanBibliography } from '@/server/verify-engine/batch-cleaner'
import { persistBatch } from '@/server/verify-engine/persistence'
import type { FormatStyle } from '@/server/verify-engine/models'

// POST { raw: string, style?: FormatStyle }
// Parses a pasted bibliography, runs each entry through the 3-layer library
// fallback, flags hallucinations, returns real recommendations, and persists
// the whole batch to the database so it appears in /api/my-library.
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

    // Persist the batch to the database (best-effort).
    try {
      await persistBatch({
        items: result.items.map((i) => ({
          raw: i.raw,
          parsedAuthor: i.parsedAuthor,
          parsedYear: i.parsedYear,
          parsedTitle: i.parsedTitle,
          status: i.status,
          recommendation: i.recommendation
            ? {
                title: i.recommendation.title,
                author: i.recommendation.author,
                year: i.recommendation.year,
                publisher: i.recommendation.publisher,
                fullApa: i.recommendation.fullApa,
              }
            : null,
        })),
      })
    } catch {
      /* persistence is best-effort */
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'clean-bibliography-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
