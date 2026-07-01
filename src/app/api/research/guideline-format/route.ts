import { NextRequest, NextResponse } from 'next/server'
import { formatWithGuideline, type GuidelineRules, type GuidelineFormatInput } from '@/lib/guideline'

// POST { rules: GuidelineRules, reference: GuidelineFormatInput }
// Re-formats a single citation according to the university's extracted rules.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const rules = body?.rules as GuidelineRules | undefined
    const reference = body?.reference as GuidelineFormatInput | undefined
    if (!rules || !reference) {
      return NextResponse.json({ ok: false, error: 'القواعد وبيانات المرجع مطلوبة.' }, { status: 400 })
    }
    const result = await formatWithGuideline(rules, reference)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'guideline-format-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
