// M6 — Retracted papers & predatory journals detector.
// We check two things for each cited reference:
//   1. Is the paper retracted? -> Retraction Watch Crossref API (free, no key)
//   2. Is the journal predatory? -> a curated list of known predatory
//      publishers/journals (Beall's-list style). The list is embedded to keep
//      the service self-contained; in production it would be loaded from a
//      maintained data file.

export interface IntegrityResult {
  retracted: boolean
  retractionReason: string | null
  retractionDate: string | null
  retractionUrl: string | null
  predatory: boolean
  predatoryNote: string | null
  originalDoi: string | null
  note: string
}

// Curated predatory publisher/journal signals. We match against the journal
// name + publisher. This is a pragmatic subset — a real deployment would load
// the full Stop Predatory Journals / Beall's list dataset.
const PREDATORY_PATTERNS: { pattern: RegExp; note: string }[] = [
  { pattern: /omics\s*(research|publishing|group|international)/i, note: 'OMICS International — مُصنّفة كمجلة مفترسة في قوائم Beall.' },
  { pattern: /hindawi/i, note: 'Hindawi — خضعت لمراجعة مشددة بعد شرائها من Wiley، بعض عناوينها مُت ideally مُت Patel ان.' },
  { pattern: /sciedu\s*press/i, note: 'Sciedu Press — مدرجة في قوائم المجلات المفترسة.' },
  { pattern: /science\s*publishing\s*group/i, note: 'Science Publishing Group — مجلة مفترسة معروفة.' },
  { pattern: /open\s*access\s*texts?/i, note: 'Open Access Text — مجلة مفترسة.' },
  { pattern: /international\s*journal\s*of\s*current\s*research/i, note: 'International Journal of Current Research — مفترسة.' },
  { pattern: /iosr\s*journals?/i, note: 'IOSR Journals — مفترسة.' },
  { pattern: /irjmets?/i, note: 'IRJMETS — مفترسة.' },
  { pattern: /ijaems?/i, note: 'IJAEMS — مفترسة.' },
  { pattern: /ijirt/i, note: 'IJIRT — مفترسة.' },
  { pattern: /wjmrs?/i, note: 'World Journal of Medical and Research Sciences — مفترسة.' },
  { pattern: /academia\.edu\s*journals?/i, note: 'مجلة مشبوهة من Academia.edu.' },
  { pattern: /international\s*journal\s*of\s*advance/i, note: 'International Journal of Advanced... — نمط مجلات مفترسة شائع.' },
  { pattern: /global\s*journal\s*for\s*research\s*analysis/i, note: 'Global Journal for Research Analysis — مفترسة.' },
]

async function checkRetraction(
  title: string,
  author: string,
  doi?: string | null,
): Promise<{
  retracted: boolean
  reason: string | null
  date: string | null
  url: string | null
  originalDoi: string | null
}> {
  // Strategy 1: if we have a DOI, check Crossref directly for the
  // "type:journal-article" with assertion retraction via the Crossref event
  // data. The simpler & more reliable path is the Retraction Watch search.
  // We use their public CSV-less search via the Crossref /works endpoint with
  // the update-type filter for retractions. As a robust fallback we also do a
  // web search for "retracted <title>".

  const query = doi || `${title} ${author}`.trim()
  if (!query) {
    return { retracted: false, reason: null, date: null, url: null, originalDoi: doi || null }
  }

  // Try Crossref works API — look for an assertion that the article is
  // retracted, or that a retraction notice exists for this DOI.
  try {
    const url = doi
      ? `https://api.crossref.org/works/${encodeURIComponent(doi)}`
      : `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=3&select=DOI,title,assertion,subject,container-title`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AcademicReferenceChecker/1.0 (mailto:contact@example.com)' },
    })
    clearTimeout(timeout)
    if (res.ok) {
      const data = await res.json()
      const work = doi ? data?.message : data?.message?.items?.[0]
      if (work) {
        // assertions array may contain {label: 'retracted', ...}
        const assertions = work.assertion || []
        const retracted = assertions.some((a: { label?: string; value?: string }) => {
          const label = String(a.label || a.value || '').toLowerCase()
          return label.includes('retract') || label.includes('withdrawn')
        })
        // also: subject contains "Retracted" sometimes
        const subjects = (work.subject || []) as string[]
        const retractedSubject = subjects.some((s: string) => /retract|withdrawn/i.test(s))
        if (retracted || retractedSubject) {
          return {
            retracted: true,
            reason: 'سُحبت الورقة وفق بيانات Crossref.',
            date: work.deposited?.['date-time'] || null,
            url: work.URL || (doi ? `https://doi.org/${doi}` : null),
            originalDoi: work.DOI || doi || null,
          }
        }
      }
    }
  } catch {
    /* network or timeout — fall through */
  }

  // Fallback: web search for "retracted <title>"
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', {
      query: `retracted "${title.slice(0, 60)}" ${author}`,
      num: 5,
    })
    if (Array.isArray(results)) {
      for (const r of results as { snippet?: string; name?: string; url?: string }[]) {
        const text = `${r.name || ''} ${r.snippet || ''}`
        if (/\bretract(ed|ion|s)?\b|\bwithdraw(n)?\b/i.test(text) && /retraction\s*watch|pubmed|retraced/i.test(text)) {
          return {
            retracted: true,
            reason: `سُحبت الورقة — ورد ذكر سحبها في نتائج البحث: «${(r.name || r.snippet || '').slice(0, 120)}»`,
            date: null,
            url: r.url || null,
            originalDoi: doi || null,
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  return { retracted: false, reason: null, date: null, url: null, originalDoi: doi || null }
}

function checkPredatory(journal: string, publisher: string | null): { predatory: boolean; note: string | null } {
  const text = `${journal} ${publisher || ''}`
  for (const p of PREDATORY_PATTERNS) {
    if (p.pattern.test(text)) {
      return { predatory: true, note: p.note }
    }
  }
  return { predatory: false, note: null }
}

export async function checkIntegrity(opts: {
  title: string
  author: string
  journal?: string | null
  publisher?: string | null
  doi?: string | null
}): Promise<IntegrityResult> {
  const { title, author, journal, publisher, doi } = opts
  const retr = await checkRetraction(title, author, doi || null)
  const pred = checkPredatory(journal || '', publisher || null)

  let note = 'المرجع سليم: غير مسحوب وغير مصنّف كمجلة مفترسة.'
  if (retr.retracted && pred.predatory) {
    note = `🚨 خطر مزدوج: الورقة مسحوبة (${retr.reason}) والمجلة مفترسة (${pred.note}). يُنصح باستبدال المرجع فوراً.`
  } else if (retr.retracted) {
    note = `🚨 تنبيه أحمر: هذه الورقة مسحوبة. ${retr.reason}${retr.url ? ` — المصدر: ${retr.url}` : ''}. استبدلها فوراً لحماية قيمة بحثك!`
  } else if (pred.predatory) {
    note = `⚠️ تنبيه: المجلة/الناشر مُصنّف كمجلة مفترسة. ${pred.note}. الاقتباس منها يضعف موقف بحثك أمام التحكيم.`
  }

  return {
    retracted: retr.retracted,
    retractionReason: retr.reason,
    retractionDate: retr.date,
    retractionUrl: retr.url,
    predatory: pred.predatory,
    predatoryNote: pred.note,
    originalDoi: retr.originalDoi,
    note,
  }
}
