import { NextRequest, NextResponse } from 'next/server'
import { generateReferences } from '@/server/verify-engine/reference-generator'
import {
  validateText,
  rateLimit,
  rateLimitResponse,
  logError,
} from '@/server/verify-engine/server-utils'
import type { FormatStyle } from '@/server/verify-engine/models'

const MAX_RESEARCH_LENGTH = 10000

// POST { researchText: string, style?: FormatStyle }
// Analyzes a research text with no references, extracts key topics, and
// returns real verified references from global libraries that discuss those
// topics. Every returned reference is confirmed to exist (no hallucinations).
export async function POST(req: NextRequest) {
  if (!rateLimit(req)) {
    return rateLimitResponse()
  }
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'متوقع JSON.' }, { status: 400 })
    }
    const textCheck = validateText(
      String(body.researchText || ''),
      'نص البحث',
      MAX_RESEARCH_LENGTH,
    )
    if (!textCheck.ok) {
      return NextResponse.json({ ok: false, error: textCheck.error }, { status: 400 })
    }
    const style = (body.style as FormatStyle) || 'apa7'
    const result = await generateReferences({ researchText: textCheck.value, style })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    logError('generate-references', e)
    const msg = e instanceof Error ? e.message : 'generate-references-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
