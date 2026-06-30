// LLM-powered extraction of citations from a researcher's draft.
// The model receives the research text and must return a strict JSON array
// of every inline citation / footnote / reference it can detect, with the
// page number and author name the researcher claimed.

import ZAI from 'z-ai-web-dev-sdk'
import type { ExtractedCitation } from './library'

const SYSTEM_PROMPT = `أنت مساعد أكاديمي متخصص في تحليل بحوث الماجستير والدكتوراه.
مهمتك: استخراج كل توثيق/اقتباس ورد في النص الذي يعطيك إيّاه المستخدم،
بصرف النظر عن صيغته (APA، MLA، حاشية، هامش، أو توثيق داخل المتن مثل: (سميث، 2020، ص 45)).

لكل توثيق تعيد كائن JSON بالحقول التالية بالضبط:
- "author": اسم المؤلف كما ورد في النص (الأخير ثم الأول إن أمكن). إن ورد أكثر من مؤلف، اكتبهم مفصولين بفاصلة منقوطة.
- "year": سنة النشر كما وردت (نص).
- "title": عنوان الكتاب/المقال إن ورد، وإلا فاتركه فارغاً "".
- "page": رقم الصفحة إن ورد (عدد صحيح)، وإلا null.
- "quote": النص المقتبس حرفياً إن وجد (بين علامتي اقتباس)، وإلا "".
- "context": الجملة أو السياق المحيط بالتوثيق (مختصر).

قواعد صارمة:
1- أعد فقط مصفوفة JSON صالحة، بدون أي شرح أو نص إضافي قبلها أو بعدها.
2- إن لم تجد أي توثيق، أعد [].
3- لا تخترع بيانات غير موجودة في النص. إن كان حقل ما غائباً استخدم "" أو null.
4- حافظ على النص العربي كما هو دون ترجمة.
5- ميّز بين التوثيقات المختلفة حتى لو لنفس المؤلف (صفحات/عناوين مختلفة = عناصر منفصلة).`

export async function extractCitations(researchText: string): Promise<ExtractedCitation[]> {
  const trimmed = researchText.trim()
  if (!trimmed) return []

  const zai = await ZAI.create()
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: SYSTEM_PROMPT },
      { role: 'user', content: trimmed },
    ],
    thinking: { type: 'disabled' },
  })

  const raw = completion.choices[0]?.message?.content || ''
  const parsed = parseJsonArrayLoose(raw)
  if (!Array.isArray(parsed)) return []

  const out: ExtractedCitation[] = []
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i] as Record<string, unknown>
    const author = String(item.author || item.Author || '').trim()
    const year = String(item.year || item.Year || item.date || '').trim()
    if (!author && !year) continue
    const title = item.title || item.Title ? String(item.title || item.Title).trim() : undefined
    const pageRaw = item.page ?? item.Page ?? item.p ?? null
    let page: number | null = null
    if (pageRaw !== null && pageRaw !== '') {
      const m = String(pageRaw).match(/\d+/)
      page = m ? parseInt(m[0], 10) : null
    }
    out.push({
      id: `cit_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      author,
      year,
      title: title || undefined,
      page,
      quote: item.quote ? String(item.quote).trim() : undefined,
      context: item.context ? String(item.context).trim() : undefined,
    })
  }
  return out
}

// Tolerant JSON array extraction: models sometimes wrap output in ```json fences
// or add a leading sentence. We grab the first '[' and last ']'.
function parseJsonArrayLoose(raw: string): unknown[] | null {
  if (!raw) return null
  // strip code fences
  let t = raw.replace(/```json/gi, '```').replace(/```/g, '').trim()
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  const slice = t.slice(start, end + 1)
  try {
    const parsed = JSON.parse(slice)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
