import { NextRequest, NextResponse } from 'next/server'
import { buildBaseGraph, enrichGraphWithCitations, suggestMissingAuthor } from '@/lib/network'

// POST { citations: [{ author, year, title }], topic?: string }
// Builds a citation network graph + suggests missing foundational authors.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const citations = Array.isArray(body?.citations) ? body.citations : []
    const topic = String(body?.topic || '').trim()
    if (citations.length === 0) {
      return NextResponse.json({ ok: false, error: 'لا توجد اقتباسات.' }, { status: 400 })
    }
    const base = buildBaseGraph(citations)
    // Enrich with real "A cites B" edges (capped web searches)
    const enriched = await enrichGraphWithCitations(base, 4)
    // Suggest missing foundational authors
    const suggestions = await suggestMissingAuthor(enriched, topic)
    // Add suggested authors as nodes
    const sugNodes = suggestions.map((s, i) => ({
      id: `suggested_${i}`,
      label: s.author.split(/\s+/).slice(-1)[0],
      author: s.author,
      type: 'suggested' as const,
      weight: 1,
    }))
    return NextResponse.json({
      ok: true,
      graph: {
        nodes: [...enriched.nodes, ...sugNodes],
        edges: enriched.edges,
        suggestions,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
