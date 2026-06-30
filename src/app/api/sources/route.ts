import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET  -> list saved sources
// POST -> create a source { type, title, authors, year, publisher, ... }
export async function GET() {
  const sources = await db.source.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { citations: true, pages: true } } },
  })
  return NextResponse.json({ ok: true, sources })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const required = ['title', 'authors', 'year']
    for (const k of required) {
      if (!body?.[k]) {
        return NextResponse.json({ ok: false, error: `الحقل مطلوب: ${k}` }, { status: 400 })
      }
    }
    const source = await db.source.create({
      data: {
        type: body.type || 'book',
        title: String(body.title),
        authors: String(body.authors),
        year: String(body.year),
        publisher: body.publisher || null,
        city: body.city || null,
        edition: body.edition || null,
        journal: body.journal || null,
        volume: body.volume || null,
        issue: body.issue || null,
        pagesRange: body.pagesRange || null,
        url: body.url || null,
        doi: body.doi || null,
        language: body.language || 'ar',
        note: body.note || null,
      },
    })
    return NextResponse.json({ ok: true, source })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'source-create-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
