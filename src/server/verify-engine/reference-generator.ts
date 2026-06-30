// ── Reference Generator ──────────────────────────────────────────────────────
// The inverse of the verifier: given a research text with NO references, this
// module analyzes the content, extracts the key topics/claims, and searches
// real global libraries for books/papers that genuinely discuss those topics.
// Every returned reference is verified to exist in a real library — no
// hallucinations.

import ZAI from 'z-ai-web-dev-sdk'
import { findInGlobalLibrary } from './library-fallback'
import { formatAlternative } from './formatters'
import type { AlternativeReference, FormatStyle } from './models'

export interface GeneratedReference {
  topic: string // the concept this reference supports
  reference: AlternativeReference
  formatted: string // in the requested style
  relevanceNote: string // why this book fits the research
}

export interface GenerateResult {
  total: number
  references: GeneratedReference[]
  extractedTopics: string[]
  note: string
}

const SYSTEM = `أنت خبير أكاديمي. سيُعطاك نص بحث بدون مراجع. مهمتك:
1. استخرج 5-8 مواضيع/مفاهيم رئيسية يتحدث عنها البحث.
2. لكل موضوع، اقترح مصطلح بحث دقيق (بالإنجليزية إن أمكن لأن المكتبات العالمية أغنى بالإنجليزية) يصلح للبحث عن كتاب حقيقي يتناول ذلك الموضوع.

أعد JSON صارم فقط:
{"topics": [{"topic": "وصف الموضوع بالعربية", "query": "search query in English", "relevance": "لماذا هذا الموضوع مهم للبحث"}]}

قواعد:
- المواضيع يجب أن تكون ملموسة وقابلة للبحث (لا مواضيع عامة جداً مثل "العلوم").
- الـ query يجب أن يكون بالإنجليزية ومحدداً (مثلاً: "deep learning neural networks" لا "AI").
- لا تخترع مراجع — فقط اقترح مصطلحات بحث.
- لا تكتب شيئاً خارج JSON.`

export async function generateReferences(opts: {
  researchText: string
  style?: FormatStyle
  maxPerTopic?: number
}): Promise<GenerateResult> {
  const { researchText, style = 'apa7', maxPerTopic = 1 } = opts
  const trimmed = researchText.trim()
  if (!trimmed || trimmed.length < 50) {
    return {
      total: 0,
      references: [],
      extractedTopics: [],
      note: 'النص قصير جداً. الصق فقرة بحث أطول (50 حرف على الأقل).',
    }
  }

  // ── Stage 1: LLM extracts key topics + search queries ──
  const topics = await extractTopics(trimmed)
  if (topics.length === 0) {
    return {
      total: 0,
      references: [],
      extractedTopics: [],
      note: 'تعذّر استخراج مواضيع من النص. حاول نصاً أوضح أو أطول.',
    }
  }

  // ── Stage 2: for each topic, search real libraries ──
  const references: GeneratedReference[] = []
  const seenTitles = new Set<string>()
  for (const t of topics) {
    try {
      // Use the English query to search libraries (richer results), but if
      // the research is Arabic, also try the Arabic topic text.
      const queries = [t.query, t.topic].filter(Boolean)
      let found: AlternativeReference | null = null
      for (const q of queries) {
        found = await findInGlobalLibrary(q, '')
        if (found) break
      }
      if (found) {
        // dedupe by normalized title
        const key = found.title.toLowerCase().slice(0, 60)
        if (seenTitles.has(key)) continue
        seenTitles.add(key)
        references.push({
          topic: t.topic,
          reference: found,
          formatted: formatAlternative(found, style),
          relevanceNote: t.relevance,
        })
        if (references.length >= 10) break // cap total
      }
    } catch {
      /* skip this topic */
    }
  }

  const note =
    references.length === 0
      ? 'تعذّر العثور على مراجع حقيقية للمواضيع المستخرجة. حاول نصاً أكثر تفصيلاً.'
      : `تم استخراج ${topics.length} موضوع من بحثك، ووجدنا ${references.length} مرجع حقيقي موثّق في المكتبات العالمية. كل مرجع مؤكد 100%.`

  return {
    total: references.length,
    references,
    extractedTopics: topics.map((t) => t.topic),
    note,
  }
}

async function extractTopics(
  text: string,
): Promise<{ topic: string; query: string; relevance: string }[]> {
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM },
        { role: 'user', content: text.slice(0, 6000) },
      ],
      thinking: { type: 'disabled' },
    })
    const raw = completion.choices[0]?.message?.content || ''
    const parsed = parseJsonLoose(raw)
    if (!parsed || !Array.isArray(parsed.topics)) return []
    return (parsed.topics as { topic?: string; query?: string; relevance?: string }[])
      .filter((t) => t.topic && t.query)
      .slice(0, 8)
      .map((t) => ({
        topic: String(t.topic),
        query: String(t.query),
        relevance: String(t.relevance || ''),
      }))
  } catch {
    return []
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
