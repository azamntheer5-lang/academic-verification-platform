import { NextRequest, NextResponse } from 'next/server'
import { extractGuidelineFromUpload, extractGuidelineRules } from '@/lib/guideline'

// POST multipart/form-data: file (PDF/DOCX), name (optional university name)
// Extracts the formatting rules from the uploaded university style guide.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ ok: false, error: 'متوقع multipart/form-data.' }, { status: 400 })
    }
    const file = form.get('file')
    const name = String(form.get('name') || '').trim()
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'لم يتم استلام ملف الدليل.' }, { status: 400 })
    }
    const { text, name: detectedName } = await extractGuidelineFromUpload(file)
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: 'تعذّر استخراج نص من الملف.' }, { status: 400 })
    }
    const rules = await extractGuidelineRules(text, name || detectedName)
    return NextResponse.json({ ok: true, rules })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'guideline-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
