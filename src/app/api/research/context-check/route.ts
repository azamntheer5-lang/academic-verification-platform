import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// POST multipart/form-data:
//   file: File (pdf or docx)        — the source file
//   quote: string                    — the verbatim quote
//   claimedPage: number | null       — where the researcher says it is
//   researcherClaim: string          — what the researcher is trying to prove
//
// We extract the matching page's text (+ prev/next page for context), then
// ask the LLM whether the researcher's usage is faithful to the author's
// intent or whether the quote was twisted / taken from a negation context.

interface ExtractedPage {
  number: number
  text: string
}

interface ContextCheckResult {
  faithful: boolean
  severity: 'ok' | 'warning' | 'critical'
  note: string
  authorIntent: string
}

const SYSTEM = `أنت محقّق أكاديمي متخصص في فحص النزاهة السياقية للاقتباسات. مهمتك:
يقدم لك الباحث: (1) نص الاقتباس كما استخدمه، (2) النص المحيط به في الكتاب الأصلي (ما قبله وما بعده)، (3) الادعاء الذي يريد الباحث إثباته بهذا الاقتباس.

تحلل ما يلي:
- هل كان المؤلف الأصلي يدعم الفكرة فعلاً، أم كان يذكرها في سياق النفي أو السخرية أو المعارضة؟
- هل استُنتج الاقتباس من سياقه بطريقة تخدم رأياً معاكساً لنية المؤلف؟

أعد JSON صارم فقط:
{"faithful": true/false, "severity": "ok"|"warning"|"critical", "authorIntent": "نية المؤلف الأصلية باختصار بالعربية", "note": "تنبيه للباحث بالعربية"}

قواعد:
- faithful=true فقط إذا كان السياق يدعم استخدام الباحث.
- severity=critical إذا كان الاقتباس ملتوياً بوضوح (المؤلف يعارض الفكرة).
- severity=warning إذا كان هناك لبس أو اقتطاع مشبوه.
- severity=ok إذا كان الاستخدام سليماً.
- لا تكتب شيئاً خارج JSON.`

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ ok: false, error: 'متوقع multipart/form-data.' }, { status: 400 })
    }
    const quote = String(form.get('quote') || '').trim()
    const claimedPageRaw = form.get('claimedPage')
    const claimedPage =
      claimedPageRaw === null || claimedPageRaw === '' || claimedPageRaw === 'null'
        ? null
        : parseInt(String(claimedPageRaw), 10)
    const researcherClaim = String(form.get('researcherClaim') || '').trim()
    const file = form.get('file')

    if (!quote) {
      return NextResponse.json({ ok: false, error: 'الاقتباس مطلوب.' }, { status: 400 })
    }
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'الملف مطلوب.' }, { status: 400 })
    }

    // Extract pages from the file via the doc-extract mini-service (port 3004)
    const lower = file.name.toLowerCase()
    const kind = lower.endsWith('.docx') ? 'docx' : 'pdf'
    const bytes = new Uint8Array(await file.arrayBuffer())
    const extractRes = await fetch('http://localhost:3004/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Kind': kind },
      body: bytes,
    })
    if (!extractRes.ok) {
      return NextResponse.json({ ok: false, error: 'تعذّر استخراج نص الملف.' }, { status: 502 })
    }
    const extractJson = (await extractRes.json()) as { ok: boolean; pages?: ExtractedPage[] }
    const pages = extractJson.pages || []
    if (pages.length === 0) {
      return NextResponse.json({ ok: false, error: 'الملف لا يحتوي على نص.' }, { status: 400 })
    }

    // Locate the page that best contains the quote (simple normalized includes)
    const { normalizeForMatch } = await import('@/lib/verify')
    const qn = normalizeForMatch(quote)
    let targetIdx = -1
    for (let i = 0; i < pages.length; i++) {
      if (normalizeForMatch(pages[i].text).includes(qn)) {
        targetIdx = i
        break
      }
    }
    if (targetIdx === -1) {
      // fall back to fuzzy: pick page with most quote tokens
      const qTokens = new Set(qn.split(' ').filter((w) => w.length > 3))
      let best = -1
      let bestScore = 0
      for (let i = 0; i < pages.length; i++) {
        const pt = new Set(normalizeForMatch(pages[i].text).split(' '))
        let inter = 0
        for (const w of qTokens) if (pt.has(w)) inter++
        const score = qTokens.size ? inter / qTokens.size : 0
        if (score > bestScore) {
          bestScore = score
          best = i
        }
      }
      targetIdx = best
      if (targetIdx === -1 || bestScore < 0.2) {
        return NextResponse.json({
          ok: true,
          result: {
            faithful: true,
            severity: 'ok',
            note: 'لم يُعثر على الاقتباس في الملف بثقة كافية لفحص السياق. تأكد من رفع الملف الصحيح.',
            authorIntent: '',
          } as ContextCheckResult,
        })
      }
    }

    // Build the context: prev page text + target page text + next page text
    const prevText = targetIdx > 0 ? pages[targetIdx - 1].text : ''
    const pageText = pages[targetIdx].text
    const nextText = targetIdx < pages.length - 1 ? pages[targetIdx + 1].text : ''
    void claimedPage

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM },
        {
          role: 'user',
          content: `=== نص الاقتباس كما استخدمه الباحث ===
${quote}

=== النص المحيط في الكتاب الأصلي ===
[الصفحة السابقة]
${prevText.slice(0, 1500) || '(بداية الكتاب)'}

[الصفحة الحاوية للاقتباس]
${pageText.slice(0, 3000)}

[الصفحة التالية]
${nextText.slice(0, 1500) || '(نهاية الفصل)'}

=== الادعاء الذي يريد الباحث إثباته بهذا الاقتباس ===
${researcherClaim || '(لم يُحدد الباحث ادعاءً صراحة)'}
`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = completion.choices[0]?.message?.content || ''
    const parsed = parseJsonLoose(raw)
    if (!parsed) {
      return NextResponse.json({
        ok: true,
        result: {
          faithful: true,
          severity: 'ok',
          note: 'تعذّر تحليل رد النموذج. يُنصح بالمراجعة اليدوية.',
          authorIntent: '',
        } as ContextCheckResult,
      })
    }
    const result: ContextCheckResult = {
      faithful: Boolean(parsed.faithful),
      severity: (['ok', 'warning', 'critical'].includes(String(parsed.severity))
        ? String(parsed.severity)
        : 'ok') as ContextCheckResult['severity'],
      authorIntent: String(parsed.authorIntent || ''),
      note: String(parsed.note || ''),
    }
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'context-check-error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

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
