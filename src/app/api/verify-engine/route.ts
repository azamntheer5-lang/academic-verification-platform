import { NextRequest, NextResponse } from 'next/server'
import { runVerification } from '@/server/verify-engine/service'

// POST multipart/form-data:
//   file:          PDF file
//   author:        string
//   quote:         string
//   page:          string (optional, the expected page number)
//
// Thin route handler that delegates to the decoupled verify-engine service.
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
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'verify-engine-error'
    return NextResponse.json(
      { status: 'ERROR', message: msg, page: null, alternative: null },
      { status: 500 },
    )
  }
}
