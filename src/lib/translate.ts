// Cross-lingual translation for citation verification.
// When a researcher writes an Arabic paraphrase of a foreign (usually English)
// source, we translate the quote to English and run the web search with the
// English version — that's where the original book actually lives.

import ZAI from 'z-ai-web-dev-sdk'

const SYSTEM = `أنت مترجم أكاديمي دقيق. مهمتك ترجمة النص المعطى إلى اللغة الهدف مع الحفاظ التام على المعنى الأكاديمي والمصطلحات العلمية.
قواعد صارمة:
- أعد النص المترجم فقط، بدون أي شرح أو علامات اقتباس أو مقدمات.
- حافظ على المصطلحات العلمية والأسماء كما هي.
- إذا كان النص أصلاً باللغة الهدف، أعده كما هو.`

export type Lang = 'ar' | 'en' | 'fr'

export function detectLang(text: string): Lang {
  const t = text || ''
  const arabic = (t.match(/[\u0600-\u06FF]/g) || []).length
  const latin = (t.match(/[a-zA-Z]/g) || []).length
  if (arabic > latin && arabic > 2) return 'ar'
  if (latin > 2) return 'en'
  return 'ar'
}

export async function translateForSearch(
  text: string,
  target: Lang = 'en',
): Promise<{ translated: string; source: Lang; target: Lang }> {
  const source = detectLang(text)
  if (source === target || !text.trim()) {
    return { translated: text, source, target }
  }
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM + `\nالترجم إلى: ${target === 'en' ? 'الإنجليزية' : target === 'ar' ? 'العربية' : 'الفرنسية'}.` },
        { role: 'user', content: text },
      ],
      thinking: { type: 'disabled' },
    })
    const out = (completion.choices[0]?.message?.content || '').trim()
    return { translated: out || text, source, target }
  } catch {
    return { translated: text, source, target }
  }
}
