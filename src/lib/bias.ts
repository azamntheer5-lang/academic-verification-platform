// M9 — Citation bias & balance analyzer.
// Pure computation over the extracted citations list. Produces a report on:
//   - recency (how old are the references?)
//   - author concentration (over-reliance on a few authors?)
//   - source diversity (books vs journals vs web)
//   - geographic / language diversity (heuristic from author & title scripts)
//   - single-source concentration (one book cited many times?)

export interface BiasReport {
  total: number
  recency: {
    score: number // 0..100, higher = newer
    buckets: { range: string; count: number }[]
    oldCount: number // before 2015
    recentCount: number // 2020+
    note: string
    severity: 'ok' | 'warning' | 'critical'
  }
  authorConcentration: {
    topAuthors: { author: string; count: number; pct: number }[]
    maxPct: number
    note: string
    severity: 'ok' | 'warning' | 'critical'
  }
  sourceDiversity: {
    types: { type: string; count: number; pct: number }[]
    note: string
    severity: 'ok' | 'warning' | 'critical'
  }
  languageDiversity: {
    ar: number
    en: number
    other: number
    note: string
    severity: 'ok' | 'warning' | 'critical'
  }
  overallNote: string
  overallSeverity: 'ok' | 'warning' | 'critical'
}

interface CitationLike {
  author?: string
  year?: string
  title?: string
  type?: string
}

function parseYear(s: string): number | null {
  const m = String(s || '').match(/\b(1[5-9]\d{2}|20\d{2})\b/)
  return m ? parseInt(m[1], 10) : null
}

function isArabic(s: string): boolean {
  return (/[\u0600-\u06FF]/.test(s || ''))
}

function typeOf(c: CitationLike): string {
  if (c.type) return c.type
  const t = (c.title || '').toLowerCase()
  if (/journal|مجلة|دار النشر|مجلة علمية/.test(t)) return 'journal'
  if (/university|جامعة|thesis|رسالة|دكتوراه|ماجستير/.test(t)) return 'thesis'
  if (/http|www|موقع|website/.test(t)) return 'web'
  return 'book'
}

export function analyzeBias(citations: CitationLike[]): BiasReport {
  const total = citations.length

  // ── recency ──
  const now = new Date().getFullYear()
  const buckets = [
    { range: `${now}-الحالي`, count: 0, min: now - 2 },
    { range: `${now - 5}–${now - 3}`, count: 0, min: now - 5 },
    { range: `${now - 10}–${now - 6}`, count: 0, min: now - 10 },
    { range: `${now - 20}–${now - 11}`, count: 0, min: now - 20 },
    { range: `قبل ${now - 20}`, count: 0, min: 0 },
  ]
  let oldCount = 0
  let recentCount = 0
  let yearSum = 0
  let yearCount = 0
  for (const c of citations) {
    const y = parseYear(c.year || '')
    if (y === null) continue
    yearSum += y
    yearCount++
    if (y >= now - 2) { buckets[0].count++; recentCount++ }
    else if (y >= now - 5) buckets[1].count++
    else if (y >= now - 10) buckets[2].count++
    else if (y >= now - 20) buckets[3].count++
    else buckets[4].count++
    if (y < 2015) oldCount++
    if (y >= 2020) recentCount++
  }
  const avgYear = yearCount ? Math.round(yearSum / yearCount) : 0
  const recencyScore = yearCount ? Math.max(0, Math.min(100, Math.round(((avgYear - 1990) / (now - 1990)) * 100))) : 0
  const recencySeverity: BiasReport['recency']['severity'] =
    oldCount > total * 0.6 ? 'critical' : oldCount > total * 0.4 ? 'warning' : 'ok'
  const recencyNote =
    yearCount === 0
      ? 'تعذّر تحديد سنوات المراجع.'
      : recencySeverity === 'critical'
        ? `⚠️ ${Math.round((oldCount / total) * 100)}% من مراجعك قديمة (قبل 2015). متوسط السنة: ${avgYear}. أضف مراجع حديثة لتعكس آخر التطورات.`
        : recencySeverity === 'warning'
          ? `تنوع مقبول لكن ${oldCount} مرجع قديم. متوسط السنة: ${avgYear}.`
          : `✅ مراجعك حديثة بشكل جيد. متوسط السنة: ${avgYear}.`

  // ── author concentration ──
  const authorMap = new Map<string, number>()
  for (const c of citations) {
    const a = (c.author || '').trim()
    if (!a) continue
    // take the last name as a key (handles "Smith, John" and "John Smith")
    const key = a.includes(',') ? a.split(',')[0].trim().toLowerCase() : a.split(/\s+/).slice(-1)[0].toLowerCase()
    authorMap.set(key, (authorMap.get(key) || 0) + 1)
  }
  const topAuthors = [...authorMap.entries()]
    .map(([author, count]) => ({ author, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  const maxPct = topAuthors[0]?.pct || 0
  const authorSeverity: BiasReport['authorConcentration']['severity'] =
    maxPct >= 40 ? 'critical' : maxPct >= 25 ? 'warning' : 'ok'
  const authorNote =
    topAuthors.length === 0
      ? 'لا توجد أسماء مؤلفين كافية للتحليل.'
      : authorSeverity === 'critical'
        ? `⚠️ اعتمدت بنسبة ${maxPct}% على مؤلف واحد («${topAuthors[0].author}»). هذا يضعف استقلالية شخصيتك البحثية — نوّع مصادرك.`
        : authorSeverity === 'warning'
          ? `اعتماد معتدل على «${topAuthors[0].author}» (${maxPct}%). يُنصح بتقليل التركيز.`
          : `✅ توزيع جيد بين المؤلفين.`

  // ── source diversity ──
  const typeMap = new Map<string, number>()
  for (const c of citations) {
    const t = typeOf(c)
    typeMap.set(t, (typeMap.get(t) || 0) + 1)
  }
  const types = [...typeMap.entries()].map(([type, count]) => ({ type, count, pct: Math.round((count / total) * 100) }))
  const distinctTypes = types.length
  const sourceSeverity: BiasReport['sourceDiversity']['severity'] =
    distinctTypes <= 1 ? 'critical' : distinctTypes === 2 ? 'warning' : 'ok'
  const sourceNote =
    sourceSeverity === 'critical'
      ? `⚠️ كل مراجعك من نوع واحد (${types[0]?.type || 'غير محدد'}). نوّع بين الكتب والمقالات والأطروحات.`
      : sourceSeverity === 'warning'
        ? `تنوع محدود (${distinctTypes} أنواع). يُفضّل إضافة المزيد من المقالات المحكّمة.`
        : `✅ تنوع جيد في أنواع المصادر.`

  // ── language diversity ──
  let ar = 0, en = 0, other = 0
  for (const c of citations) {
    const text = `${c.author || ''} ${c.title || ''}`
    if (isArabic(text)) ar++
    else if (/^[a-zA-Z0-9\s.,;:'"()\-]+$/.test(text) && text.trim()) en++
    else other++
  }
  const langSeverity: BiasReport['languageDiversity']['severity'] =
    (ar === total || en === total) && total > 3 ? 'warning' : 'ok'
  const langNote =
    langSeverity === 'warning'
      ? ar === total
        ? `⚠️ كل مراجعك عربية. أضف مراجع أجنبية لتعزيز الإطار النظري.`
        : `⚠️ كل مراجعك أجنبية. أضف دراسات محلية عربية لإثراء البحث.`
      : `✅ تنوع لغوي جيد (عربي: ${ar}، أجنبي: ${en}).`

  // ── overall ──
  const severities = [recencySeverity, authorSeverity, sourceSeverity, langSeverity]
  const overallSeverity: BiasReport['overallSeverity'] = severities.includes('critical')
    ? 'critical'
    : severities.includes('warning')
      ? 'warning'
      : 'ok'
  const overallNote =
    overallSeverity === 'critical'
      ? 'تقرير التحيز: رصد النظام مشاكل حرجة في توازن مراجعك. راجع التفاصيل أدناه وعالجها قبل التقديم للجنة التحكيم.'
      : overallSeverity === 'warning'
        ? 'تقرير التحيز: هناك تحذيرات بسيطة في توازن المراجع. راجعها لتحسين جودة البحث.'
        : 'تقرير التحيز: مراجعك متوازنة بشكل جيد من حيث الحداثة والتنوع والتركيز.'

  return {
    total,
    recency: { score: recencyScore, buckets, oldCount, recentCount, note: recencyNote, severity: recencySeverity },
    authorConcentration: { topAuthors, maxPct, note: authorNote, severity: authorSeverity },
    sourceDiversity: { types, note: sourceNote, severity: sourceSeverity },
    languageDiversity: { ar, en, other, note: langNote, severity: langSeverity },
    overallNote,
    overallSeverity,
  }
}
