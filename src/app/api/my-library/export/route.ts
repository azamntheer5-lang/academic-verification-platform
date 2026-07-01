import { NextResponse } from 'next/server'
import { fetchMyLibrary } from '@/server/verify-engine/persistence'
import { toBibTeX, toRIS, type ExportSource } from '@/lib/export'
import { logError } from '@/server/verify-engine/server-utils'

// GET /api/my-library/export?format=ris|bibtex
// Exports the user's entire library as a single RIS or BibTeX file ready for
// import into Zotero, EndNote, Mendeley, or JabRef.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const format = url.searchParams.get('format') === 'ris' ? 'ris' : 'bibtex'
    const { citations } = await fetchMyLibrary()

    if (citations.length === 0) {
      return NextResponse.json({ ok: false, error: 'لا توجد سجلات للتصدير.' }, { status: 400 })
    }

    const sources: ExportSource[] = citations.map((c) => ({
      type: 'book',
      title: c.verifiedTitle || c.quoteInput.slice(0, 60) || 'مرجع',
      authors: c.verifiedAuthor || c.authorInput || 'غير معروف',
      year: c.verifiedYear || 'بلا تاريخ',
      publisher: c.verifiedPublisher || null,
      pagesRange: c.verifiedPage || null,
      url: null,
      doi: null,
      note: c.fullApaCitation || null,
    }))

    const content = sources.map((s) => (format === 'ris' ? toRIS(s) : toBibTeX(s))).join('\n\n')
    const ext = format === 'ris' ? 'ris' : 'bib'
    const mime = format === 'ris' ? 'application/x-research-info-systems' : 'application/x-bibtex'
    const filename = `my-library.${ext}`

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': `${mime}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    logError('my-library:export', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'export-error' },
      { status: 500 },
    )
  }
}
