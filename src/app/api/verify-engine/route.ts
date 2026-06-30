import { NextRequest, NextResponse } from 'next/server'
import { runVerification } from '@/server/verify-engine/service'
import { persistVerification } from '@/server/verify-engine/persistence'
import {
  validateFile,
  validateText,
  rateLimit,
  rateLimitResponse,
  logError,
  MAX_QUOTE_LENGTH,
  MAX_AUTHOR_LENGTH,
} from '@/server/verify-engine/server-utils'

// POST multipart/form-data:
//   file:          PDF file (max 10MB)
//   author:        string (max 200 chars)
//   quote:         string (max 5000 chars)
//   page:          string (optional, the expected page number)
//   semantic:      'true' to enable paraphrase matching (Module 1)
//
// Validates inputs, rate-limits per IP, runs the hybrid verification, then
// persists the audit record to the database.
export async function POST(req: NextRequest) {
  // ── Rate limit ──
  if (!rateLimit(req)) {
    return rateLimitResponse()
  }
  try {
    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ status: 'ERROR', message: 'متوقع multipart/form-data.' }, { status: 400 })
    }
    const file = form.get('file')
    const fileCheck = validateFile(file instanceof File ? file : null, ['.pdf'])
    if (!fileCheck.ok) {
      return NextResponse.json(
        { status: 'ERROR', message: fileCheck.error, page: null, alternative: null },
        { status: 400 },
      )
    }

    const authorCheck = validateText(String(form.get('author') || ''), 'اسم العالم', MAX_AUTHOR_LENGTH)
    if (!authorCheck.ok) {
      return NextResponse.json(
        { status: 'ERROR', message: authorCheck.error, page: null, alternative: null },
        { status: 400 },
      )
    }

    const quoteCheck = validateText(String(form.get('quote') || ''), 'نص الاقتباس', MAX_QUOTE_LENGTH)
    if (!quoteCheck.ok) {
      return NextResponse.json(
        { status: 'ERROR', message: quoteCheck.error, page: null, alternative: null },
        { status: 400 },
      )
    }

    const page = String(form.get('page') || form.get('expected_page') || '').trim()
    const semantic = String(form.get('semantic') || '') === 'true'

    const result = await runVerification({
      file: fileCheck.file,
      author: authorCheck.value,
      quote: quoteCheck.value,
      expectedPage: page,
      semantic,
    })

    // Persist the audit record — log errors instead of silently swallowing.
    try {
      await persistVerification({
        author: authorCheck.value,
        quote: quoteCheck.value,
        expectedPage: page,
        status: result.status,
        printedPage: result.page,
        alternative: result.alternative
          ? {
              title: result.alternative.title,
              author: result.alternative.author,
              year: result.alternative.year,
              publisher: result.alternative.publisher,
              fullApa: result.alternative.fullApa,
            }
          : null,
      })
    } catch (e) {
      logError('verify-engine:persist', e)
    }

    return NextResponse.json(result)
  } catch (e) {
    logError('verify-engine', e)
    const msg = e instanceof Error ? e.message : 'verify-engine-error'
    return NextResponse.json(
      { status: 'ERROR', message: msg, page: null, alternative: null },
      { status: 500 },
    )
  }
}
