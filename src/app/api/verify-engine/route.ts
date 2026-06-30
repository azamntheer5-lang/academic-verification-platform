import { NextRequest, NextResponse } from 'next/server'
import { runVerification } from '@/server/verify-engine/service'
import { persistVerification } from '@/server/verify-engine/persistence'

// POST multipart/form-data:
//   file:          PDF file
//   author:        string
//   quote:         string
//   page:          string (optional, the expected page number)
//   semantic:      'true' to enable paraphrase matching (Module 1)
//
// Thin route handler that delegates to the decoupled verify-engine service,
// then persists the audit record to the database (User/Research/Citation/
// VerificationResult) so it shows up in /api/my-library.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ status: 'ERROR', message: 'متوقع multipart/form-data.' }, { status: 400 })
    }
    const file = form.get('file')
    const author = String(form.get('author') || '')
    const quote = String(form.get('quote') || '')
    const page = String(form.get('page') || form.get('expected_page') || '')
    const semantic = String(form.get('semantic') || '') === 'true'

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { status: 'ERROR', message: 'لم يتم استلام ملف PDF.', page: null, alternative: null },
        { status: 400 },
      )
    }
    if (!author.trim() || !quote.trim()) {
      return NextResponse.json(
        { status: 'ERROR', message: 'اسم العالم ونص الاقتباس مطلوبان.', page: null, alternative: null },
        { status: 400 },
      )
    }

    const result = await runVerification({ file, author, quote, expectedPage: page, semantic })

    // Persist the audit record (non-blocking — failure here must not break
    // the verification response).
    try {
      await persistVerification({
        author,
        quote,
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
    } catch {
      /* persistence is best-effort */
    }

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'verify-engine-error'
    return NextResponse.json(
      { status: 'ERROR', message: msg, page: null, alternative: null },
      { status: 500 },
    )
  }
}
