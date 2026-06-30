import { NextRequest, NextResponse } from 'next/server'
import { toBibTeX, toRIS, type ExportSource } from '@/lib/export'

// POST { source: ExportSource, format: 'bibtex' | 'ris' }
// Returns the formatted citation string ready for download / copy-paste into
// Zotero, EndNote, Mendeley, JabRef.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const source = body?.source as Partial<ExportSource> | undefined
    const format = String(body?.format || 'bibtex').toLowerCase()
    if (!source || !source.title) {
      return NextResponse.json({ ok: false, error: 'بيانات المصدر ناقصة.' }, { status: 400 })
    }
    const full: ExportSource = {
      type: source.type || 'book',
      title: source.title,
      authors: source.authors || '',
      year: source.year || '',
      publisher: source.publisher || null,
      city: source.city || null,
      edition: source.edition || null,
      journal: source.journal || null,
      volume: source.volume || null,
      issue: source.issue || null,
      pagesRange: source.pagesRange || null,
      url: source.url || null,
      doi: source.doi || null,
      isbn: source.isbn || null,
      language: source.language || null,
      note: source.note || null,
    }
    const content = format === 'ris' ? toRIS(full) : toBibTeX(full)
    const ext = format === 'ris' ? 'ris' : 'bib'
    const mime = format === 'ris' ? 'application/x-research-info-systems' : 'application/x-bibtex'
    return NextResponse.json({ ok: true, format, content, filename: `reference.${ext}`, mime })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'export-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
