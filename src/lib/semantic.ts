// Semantic (paraphrase) matching via the LLM.
// When a researcher paraphrases an idea instead of quoting verbatim, exact /
// fuzzy text matching fails. We ask the model to judge whether a page's text
// conveys the same meaning as the claimed quote, returning a strict JSON
// verdict we can trust for the page-number verification flow.

import ZAI from 'z-ai-web-dev-sdk'

export interface SemanticMatchResult {
  isMatch: boolean
  confidence: number // 0..1
  reason: string
  matchedSnippet: string // the passage on the page that conveys the meaning
}

const SYSTEM = `أنت خبير أكاديمي متخصص في تحليل النصوص. مهمتك:
تحدد ما إذا كانت فقرة من كتاب تحمل نفس المعنى (الفكرة/المفهوم) الذي يعبر عنه نص باحث، حتى لو اختلف التعبير والكلمات بنسبة كبيرة (إعادة صياغة).

تُعاد JSON صارم فقط بالشكل:
{"isMatch": true/false, "confidence": 0.0-1.0, "reason": "سبب قصير بالعربية", "matchedSnippet": "المقطع الدقيق من الصفحة الذي يحمل المعنى"}

قواعد:
- isMatch=true فقط إذا كان المعنى الأساسي حاضراً فعلاً في الصفحة.
- لا تخترع تطابقاً غير موجود. إذا لم تجد المعنى، isMatch=false بثقة عالية.
- matchedSnippet يجب أن يكون اقتباساً حرفياً من نص الصفحة (وليس إعادة صياغة).
- لا تكتب أي شيء خارج JSON.`

export async function semanticMatchQuote(
  quote: string,
  pageText: string,
): Promise<SemanticMatchResult> {
  const cleanQuote = quote.trim()
  if (!cleanQuote) {
    return { isMatch: false, confidence: 0, reason: 'اقتباس فارغ', matchedSnippet: '' }
  }
  // Truncate page text to keep token usage reasonable (≈ 4000 chars ≈ 1000 tokens)
  const truncated = pageText.slice(0, 4000)
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM },
        {
          role: 'user',
          content: `نص الباحث (الاقتباس/إعادة الصياغة):\n"""\n${cleanQuote}\n"""\n\nنص الصفحة من الكتاب:\n"""\n${truncated}\n"""`,
        },
      ],
      thinking: { type: 'disabled' },
    })
    const raw = completion.choices[0]?.message?.content || ''
    const parsed = parseJsonLoose(raw)
    if (!parsed) {
      return { isMatch: false, confidence: 0, reason: 'تعذّر تحليل رد النموذج', matchedSnippet: '' }
    }
    return {
      isMatch: Boolean(parsed.isMatch),
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      reason: String(parsed.reason || ''),
      matchedSnippet: String(parsed.matchedSnippet || ''),
    }
  } catch (e) {
    return {
      isMatch: false,
      confidence: 0,
      reason: e instanceof Error ? e.message : 'semantic-error',
      matchedSnippet: '',
    }
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

// Run semantic matching against the top candidate pages (by fuzzy score) and
// return the first page that the model confirms. Limits LLM calls to topN.
export async function semanticScanPages(
  quote: string,
  pages: { number: number; text: string }[],
  rankedPages: { page: number; score: number }[],
  topN = 4,
): Promise<{ page: number; result: SemanticMatchResult } | null> {
  const top = rankedPages.slice(0, topN)
  for (const r of top) {
    const p = pages.find((pg) => pg.number === r.page)
    if (!p) continue
    const res = await semanticMatchQuote(quote, p.text)
    if (res.isMatch && res.confidence >= 0.6) {
      return { page: r.page, result: res }
    }
  }
  return null
}
