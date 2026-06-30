import { NextRequest, NextResponse } from 'next/server'
import { cleanBibliography } from '@/server/verify-engine/batch-cleaner'
import { persistBatch } from '@/server/verify-engine/persistence'
import {
  validateText,
  rateLimit,
  rateLimitResponse,
  logError,
  MAX_BIBLIOGRAPHY_LENGTH,
} from '@/server/verify-engine/server-utils'
import type { FormatStyle } from '@/server/verify-engine/models'

// POST { raw: string, style?: FormatStyle }
// Validates, rate-limits, parses the bibliography, runs 3-layer verification,
// flags hallucinations, returns recommendations, and persists to the database.
export async function POST(req: NextRequest) {
  if (!rateLimit(req)) {
    return rateLimitResponse()
  }
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'متوقع JSON.' }, { status: 400 })
    }
    const rawCheck = validateText(String(body.raw || ''), 'قائمة المراجع', MAX_BIBLIOGRAPHY_LENGTH)
    if (!rawCheck.ok) {
      return NextResponse.json({ ok: false, error: rawCheck.error }, { status: 400 })
    }
    const style = (body.style as FormatStyle) || 'apa7'
    const result = await cleanBibliography({ raw: rawCheck.value, style })

    // Persist the batch — log errors instead of silently swallowing.
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
    } catch (e) {
      logError('clean-bibliography:persist', e)
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    logError('clean-bibliography', e)
    const msg = e instanceof Error ? e.message : 'clean-bibliography-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
