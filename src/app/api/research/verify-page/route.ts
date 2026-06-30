import { NextRequest, NextResponse } from 'next/server'
import { verifyPageNumber } from '@/lib/verify'
import type { PageVerifyResult as LibPageVerifyResult } from '@/lib/verify'

// POST multipart/form-data with fields:
//   file: File (pdf or docx)          — required
//   quote: string                      — the verbatim citation quote
//   claimedPage: number | null         — the page the researcher claims
//
// The actual PDF/DOCX parsing happens in a dedicated mini-service on port
// 3004 (mini-services/doc-extract). We forward the raw file bytes there and
// get back per-page text. The page-level matching then runs locally in this
// route using src/lib/verify.ts.

interface ExtractedPage {
  number: number
  text: string
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ ok: false, error: 'متوقع طلب multipart/form-data.' }, { status: 400 })
    }

    const quote = String(form.get('quote') || '').trim()
    const claimedPageRaw = form.get('claimedPage')
    const claimedPage =
      claimedPageRaw === null || claimedPageRaw === '' || claimedPageRaw === 'null'
        ? null
        : parseInt(String(claimedPageRaw), 10)

    const file = form.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'لم يتم استلام ملف. ارفع ملف PDF أو DOCX.' },
        { status: 400 },
      )
    }

    const lower = file.name.toLowerCase()
    let kind: 'pdf' | 'docx'
    if (lower.endsWith('.pdf')) kind = 'pdf'
    else if (lower.endsWith('.docx')) kind = 'docx'
    else {
      return NextResponse.json(
        { ok: false, error: 'صيغة الملف غير مدعومة. ارفع PDF أو DOCX فقط.' },
        { status: 400 },
      )
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    // Call the doc-extract mini-service (port 3004). The mini-service runs as
    // an independent bun process, so we hit it directly on localhost — the
    // gateway XTransformPort trick is only needed for browser-originated
    // requests, not for server-to-server fetches.
    const extractRes = await fetch('http://localhost:3004/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Kind': kind },
      body: bytes,
    })

    if (!extractRes.ok) {
      let errMsg = 'فشل استخراج النص من الخدمة.'
      try {
        const ej = await extractRes.json()
        errMsg = ej?.error || errMsg
      } catch {
        /* ignore */
      }
      return NextResponse.json({ ok: false, error: errMsg }, { status: 502 })
    }

    const extractJson = (await extractRes.json()) as {
      ok: boolean
      pages?: ExtractedPage[]
      total?: number
      error?: string
    }

    if (!extractJson.ok || !extractJson.pages || extractJson.pages.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: extractJson.error || 'تعذّر استخراج أي نص من الملف. قد يكون الملف ممسوحاً ضوئياً (صور) أو محمياً.',
        },
        { status: 400 },
      )
    }

    const pages = extractJson.pages
    const result: LibPageVerifyResult = verifyPageNumber({ quote, claimedPage, pages })

    return NextResponse.json({
      ok: true,
      file: { name: file.name, kind, total: pages.length },
      result,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'verify-page-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
