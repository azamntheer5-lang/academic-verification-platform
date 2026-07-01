import { NextRequest, NextResponse } from 'next/server'
import { verifyPageNumber, extractPrintedPageNumber } from '@/lib/verify'
import type { PageVerifyResult as LibPageVerifyResult } from '@/lib/verify'
import { findCitationOnWeb } from '@/lib/library'
import { semanticScanPages } from '@/lib/semantic'

// POST multipart/form-data with fields:
//   file: File (pdf or docx)          — required
//   quote: string                      — the verbatim citation quote
//   claimedPage: number | null         — the page the researcher claims
//   author: string                     — the claimed author (for the fallback)
//
// The actual PDF/DOCX parsing happens in a dedicated mini-service on port
// 3004 (mini-services/doc-extract). We forward the raw file bytes there and
// get back per-page text. The page-level matching then runs locally in this
// route using src/lib/verify.ts. If the quote is NOT found in the file, we
// automatically run the autonomous web fallback (findCitationOnWeb).

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
    const author = String(form.get('author') || '').trim()

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

    // Extract pages — uses mini-service (local dev) or unpdf (Vercel) automatically
    const { extractFilePages } = await import('@/server/verify-engine/server-utils')
    let pages: { number: number; text: string }[]
    try {
      pages = await extractFilePages(file, kind)
    } catch {
      return NextResponse.json(
        { ok: false, error: 'تعذّر استخراج أي نص من الملف. قد يكون الملف ممسوحاً ضوئياً (صور) أو محمياً.' },
        { status: 400 },
      )
    }
    if (pages.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'الملف لا يحتوي على نص قابل للاستخراج.' },
        { status: 400 },
      )
    }
    const semanticMode = String(form.get('semantic') || '') === 'true'
    const result: LibPageVerifyResult = verifyPageNumber({ quote, claimedPage, pages })

    // ── Semantic (paraphrase) matching ──────────────────────────────────────
    // When the exact/fuzzy text match fails, the quote may be a paraphrase.
    // We ask the LLM to compare the quote's *meaning* against the top candidate
    // pages. This runs both in explicit semantic mode and as a fallback when
    // the textual match returns not_found.
    if ((semanticMode || result.status === 'not_found') && result.candidates.length > 0) {
      try {
        const ranked = result.candidates.map((c) => ({ page: c.page, score: c.score }))
        const sem = await semanticScanPages(quote, pages, ranked, semanticMode ? 6 : 4)
        if (sem) {
          const printedReal = pages.find((p) => p.number === sem.page)?.text
          // re-evaluate the "real" printed page number for the semantically matched page
          const printed = extractPrintedPageNumber(printedReal || '')
          const realPage = printed ?? sem.page
          const exactMatch = sem.result.confidence >= 0.85
          result.status = claimedPage
            ? claimedPage === realPage || claimedPage === sem.page
              ? 'verified'
              : 'wrong_page'
            : 'verified'
          result.matchedPage = sem.page
          result.realPage = realPage
          result.matchScore = sem.result.confidence
          result.exactMatch = exactMatch
          result.snippet = sem.result.matchedSnippet || sem.result.reason
          result.confidence = sem.result.confidence
          if (result.status === 'verified') {
            result.note =
              realPage !== sem.page
                ? `مطابقة دلالية: النص في الصفحة المطبوعة ${realPage} (داخل الملف ص ${sem.page}) يحمل نفس معنى اقتباسك. ثقة ${Math.round(sem.result.confidence * 100)}%. ${sem.result.reason}`
                : `مطابقة دلالية: النص في الصفحة ${realPage} يحمل نفس معنى اقتباسك (إعادة صياغة). ثقة ${Math.round(sem.result.confidence * 100)}%. ${sem.result.reason}`
          } else {
            result.note = `الاقتباس (بالمعنى) موجود في الصفحة المطبوعة ${realPage} لا الصفحة ${claimedPage}. ثقة ${Math.round(sem.result.confidence * 100)}%. ${sem.result.reason}`
          }
        }
      } catch {
        /* semantic failed, fall through to web fallback */
      }
    }

    // ── Autonomous web fallback ─────────────────────────────────────────────
    // When the quote was STILL not located (even after semantic), the system
    // "flies" the quote + author to global libraries and returns a verified
    // citation. Cross-lingual translation runs inside findCitationOnWeb.
    if (result.status === 'not_found' && author) {
      try {
        const fallback = await findCitationOnWeb(quote, author)
        result.fallback = fallback
      } catch {
        result.fallback = null
      }
    }

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
