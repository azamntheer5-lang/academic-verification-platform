// M8 — Custom university guideline adapter.
// A researcher uploads their university's style guide (PDF). The LLM extracts
// the concrete formatting rules (author name format, bold/italic, punctuation,
// page format, ordering). The adapter then re-renders a citation according to
// those rules, so the bibliography matches the university's exact spec.

import ZAI from 'z-ai-web-dev-sdk'

export interface GuidelineRules {
  name: string
  rulesText: string // natural-language rules the LLM extracted
  examples: { input: string; output: string }[]
  rawExtract: string
}

export interface GuidelineFormatInput {
  author: string
  year: string
  title?: string
  publisher?: string | null
  city?: string | null
  page?: number | null
  url?: string | null
}

const SYSTEM = `أنت خبير في تنسيق المراجع الأكاديمية. سيُعطيك المستخدم:
1) قواعد التنسيق الخاصة بجامعته (مستخرجة من دليل الجامعة).
2) بيانات مرجع واحدة.

مهمتك: إعادة تنسيق المرجع ليتطابق 100% مع قواعد الجامعة — في المؤلف، السنة، العنوان، الترتيب، علامات الترقيم، الخط العريض/المائل (ممثلة بـ **bold** و *italic*)، ورقم الصفحة.

أعد JSON صارم فقط:
{"formatted": "المرجع منسّقاً حسب قواعد الجامعة", "notes": "أي ملاحظات بالعربية إن لزم"}
لا تكتب شيئاً خارج JSON.`

export async function extractGuidelineRules(pdfText: string, name: string): Promise<GuidelineRules> {
  const zai = await ZAI.create()
  const truncated = pdfText.slice(0, 8000)
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content: `أنت خبير أكاديمي. سيُعطاك نص دليل تنسيق المراجع لجامعة معينة. استخرج القواعد الملموسة فقط (لا تخترع): كيف يُكتب اسم المؤلف؟ هل بالخط العريض؟ بين قوسين؟ ما ترتيب العناصر (المؤلف، السنة، العنوان، الناشر، الصفحة)؟ ما علامات الترقيم؟ كيف يُكتب رقم الصفحة؟

أعد JSON صارم:
{"name": "اسم الجامعة إن ذُكر", "rulesText": "القواعد الملموسة بالعربية", "examples": [{"input": "حقل", "output": "مثال"}]}

إذا لم تجد قواعد واضحة، أعد rulesText فارغاً. لا تكتب شيئاً خارج JSON.`,
      },
      { role: 'user', content: `اسم الجامعة المُدخل: ${name}\n\n=== نص الدليل ===\n${truncated}` },
    ],
    thinking: { type: 'disabled' },
  })
  const raw = completion.choices[0]?.message?.content || ''
  const parsed = parseJsonLoose(raw)
  return {
    name: String(parsed?.name || name),
    rulesText: String(parsed?.rulesText || ''),
    examples: Array.isArray(parsed?.examples) ? (parsed.examples as { input: string; output: string }[]) : [],
    rawExtract: pdfText,
  }
}

export async function formatWithGuideline(
  rules: GuidelineRules,
  ref: GuidelineFormatInput,
): Promise<{ formatted: string; notes: string }> {
  if (!rules.rulesText.trim()) {
    return { formatted: '', notes: 'لا توجد قواعد مستخرجة من دليل الجامعة. ارفع دليلاً أوضح.' }
  }
  const zai = await ZAI.create()
  const refJson = JSON.stringify(ref, null, 2)
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: SYSTEM },
      {
        role: 'user',
        content: `=== قواعد جامعتي ===\n${rules.rulesText}\n\n=== بيانات المرجع ===\n${refJson}`,
      },
    ],
    thinking: { type: 'disabled' },
  })
  const raw = completion.choices[0]?.message?.content || ''
  const parsed = parseJsonLoose(raw)
  return {
    formatted: String(parsed?.formatted || ''),
    notes: String(parsed?.notes || ''),
  }
}

// Wrapper that calls the doc-extract mini-service (port 3004) so we don't
// import pdf-parse into the Next bundle.
export async function extractGuidelineFromUpload(file: File): Promise<{ text: string; name: string }> {
  const lower = file.name.toLowerCase()
  const kind = lower.endsWith('.docx') ? 'docx' : 'pdf'
  const bytes = new Uint8Array(await file.arrayBuffer())
  const res = await fetch('http://localhost:3004/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Kind': kind },
    body: bytes,
  })
  if (!res.ok) throw new Error('تعذّر استخراج نص الدليل.')
  const data = (await res.json()) as { ok: boolean; pages?: { number: number; text: string }[] }
  const text = (data.pages || []).map((p) => p.text).join('\n\n')
  return { text, name: file.name.replace(/\.(pdf|docx)$/i, '') }
}

// re-export type for callers that import from here
// (extractPdfPages lives in the doc-extract mini-service; we don't import it here)

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  const t = raw.replace(/```json/gi, '```').replace(/```/g, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}
