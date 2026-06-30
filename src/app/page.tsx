'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Loader2, Sparkles, ScanSearch, FileCheck2, AlertTriangle, BookOpenCheck, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { CitationCard } from '@/components/citation/citation-card'
import { SourcesPanel } from '@/components/citation/sources-panel'
import type { CitationRow, ExtractedCitation, VerifyResult, PageVerifyResult } from '@/lib/types'

const SAMPLE = `يُعدّ التعلم العميق أحد فروع الذكاء الاصطناعي التي حققت تقدماً ملحوظاً في السنوات الأخيرة. فقد أشار (لوديتش، 2016، ص 45) إلى أن الشبكات العصبية الاصطناعية قادرة على تمثيل دوال معقدة بدقة عالية. كما يؤكد بيرسون (Pearson, 2019, p. 112) أن المعالجة الموزعة تُحسّن من كفاءة التدريب بشكل كبير.

وفي السياق ذاته، ذكر السيد وآخرون (2021، ص 30) أن خوارزميات الانحدار التدريجي تُقلّل من خطر الفرط في التعلّم. بينما يرى جونسون (Johnson, 2018) أن البيانات الضخمة تتطلب بنية تحتية مرنة، وذلك في كتابه "أساسيات البيانات الضخمة" (ص 88).`

export default function Home() {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<CitationRow[]>([])
  const [extracting, setExtracting] = useState(false)
  const [globalVerifying, setGlobalVerifying] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const extract = async () => {
    if (!text.trim()) {
      toast.error('الصق نص البحث أولاً.')
      return
    }
    setExtracting(true)
    setRows([])
    try {
      const res = await fetch('/api/research/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'تعذّر استخراج التوثيقات.')
        return
      }
      const citations = data.citations as ExtractedCitation[]
      if (citations.length === 0) {
        toast.info('لم يُعثر على توثيقات في النص. تأكد أن النص يحتوي على اقتباسات بصيغة (المؤلف، السنة، الصفحة).')
        return
      }
      setRows(
        citations.map((c) => ({
          ...c,
          status: 'pending' as const,
          verifying: false,
        })),
      )
      toast.success(`استُخرج ${citations.length} توثيق.`)
    } catch {
      toast.error('خطأ في الاتصال بالخادم.')
    } finally {
      setExtracting(false)
    }
  }

  const verifyOne = async (id: string) => {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, verifying: true } : r)))
    try {
      const res = await fetch('/api/research/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citation: row }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'تعذّر التحقق.')
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, verifying: false } : r)))
        return
      }
      const result = data.result as VerifyResult
      setRows((rs) =>
        rs.map((r) => (r.id === id ? { ...r, verifying: false, result, status: result.status } : r)),
      )
      const labels: Record<string, string> = {
        verified: 'موثَّق ✓',
        author_mismatch: 'خطأ في المؤلف ✗',
        not_found: 'غير موجود ✗',
        partial: 'تطابق جزئي',
        error: 'خطأ',
      }
      toast(`التوثيق #${rows.findIndex((r) => r.id === id) + 1}: ${labels[result.status] || result.status}`)
    } catch {
      toast.error('خطأ في الاتصال.')
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, verifying: false } : r)))
    }
  }

  const verifyAll = async () => {
    const pending = rows.filter((r) => !r.verifying)
    if (pending.length === 0) return
    setGlobalVerifying(true)
    // verify sequentially to be gentle on external APIs
    for (const r of pending) {
      await verifyOne(r.id)
    }
    setGlobalVerifying(false)
    toast.success('اكتمل التحقق من جميع التوثيقات.')
  }

  const saveSource = async (row: CitationRow) => {
    setSavingId(row.id)
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: row.title ? 'book' : 'other',
          title: row.title || `مرجع ${row.author} ${row.year}`.trim(),
          authors: row.author || 'غير معروف',
          year: row.year || 'بلا تاريخ',
          url: row.result?.bestHit?.url || null,
          note: row.result?.note || null,
          pagesRange: row.page ? String(row.page) : null,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('حُفظ المصدر في مكتبتك.')
        // refresh sources panel via window event
        window.dispatchEvent(new CustomEvent('sources-changed'))
      } else {
        toast.error(data.error || 'تعذّر الحفظ.')
      }
    } catch {
      toast.error('خطأ في الاتصال.')
    } finally {
      setSavingId(null)
    }
  }

  const verifyPage = async (
    id: string,
    file: File,
    quote: string,
    claimedPage: number | null,
  ) => {
    if (!quote || !quote.trim()) {
      toast.error('أدخل النص المقتبس أولاً (اضغط «تعديل» بجانب الاقتباس).')
      return
    }
    const row = rows.find((r) => r.id === id)
    const author = row?.author || ''
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, pageVerifying: true } : r)),
    )
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('quote', quote)
      form.append('claimedPage', claimedPage === null ? '' : String(claimedPage))
      form.append('author', author)
      const res = await fetch('/api/research/verify-page', { method: 'POST', body: form })
      const data = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'تعذّر التحقق من الصفحة.')
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, pageVerifying: false } : r)))
        return
      }
      const pv = data.result as PageVerifyResult
      setRows((rs) =>
        rs.map((r) => (r.id === id ? { ...r, pageVerifying: false, pageVerify: pv } : r)),
      )
      const labels: Record<string, string> = {
        verified: 'الصفحة مؤكدة ✓',
        wrong_page: `الصفحة الصحيحة: ${pv.matchedPage}`,
        not_found: 'الاقتباس غير موجود في الملف',
        no_quote: 'لا يوجد اقتباس',
      }
      toast(labels[pv.status] || pv.status)
    } catch {
      toast.error('خطأ في الاتصال.')
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, pageVerifying: false } : r)))
    }
  }

  const editQuote = (id: string, quote: string) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, quote } : r)))
  }

  const stats = {
    total: rows.length,
    verified: rows.filter((r) => r.status === 'verified').length,
    mismatch: rows.filter((r) => r.status === 'author_mismatch' || r.status === 'not_found').length,
    partial: rows.filter((r) => r.status === 'partial').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    pagesVerified: rows.filter((r) => r.pageVerify?.status === 'verified').length,
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100/50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-6xl">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <BookOpenCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 leading-tight">مُدقِّق المراجع الأكاديمي</h1>
                <p className="text-xs text-slate-500">تحقق من توثيقات بحثك في المكتبات الإلكترونية الحقيقية</p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">
              <Sparkles className="h-3.5 w-3.5" />
              مدعوم بالذكاء الاصطناعي + Open Library
            </Badge>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6 max-w-6xl flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: work area */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ScanSearch className="h-5 w-5 text-emerald-600" />
                  الصق نص بحثك
                </CardTitle>
                <p className="text-sm text-slate-500">
                  الصق فقرات بحثك (مع التوثيقات داخل المتن أو الحواشي). سيستخرج النموذج كل توثيق، ثم يبحث عنه في المكتبات.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="مثال: أشار (سميث، 2020، ص 45) إلى أن… كما ذكر جونسون (Johnson, 2019, p. 112)…"
                  className="min-h-[220px] font-[var(--font-amiri)] text-base leading-relaxed resize-y"
                  dir="rtl"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Button onClick={extract} disabled={extracting} className="gap-1.5">
                      {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                      استخراج التوثيقات
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setText(SAMPLE)} className="text-slate-500">
                      جرّب نصاً نموذجياً
                    </Button>
                    {text && (
                      <Button variant="ghost" size="sm" onClick={() => { setText(''); setRows([]) }} className="text-slate-400">
                        مسح
                      </Button>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{text.length} حرف</span>
                </div>
              </CardContent>
            </Card>

            {rows.length > 0 && (
              <>
                <Card className="border-slate-200 shadow-sm bg-white">
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-semibold text-slate-800">التوثيقات المُستخرَجة</h2>
                        <Badge variant="secondary">{stats.total}</Badge>
                        {stats.verified > 0 && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                            <FileCheck2 className="h-3 w-3" /> {stats.verified} موثَّق
                          </Badge>
                        )}
                        {stats.mismatch > 0 && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
                            <AlertTriangle className="h-3 w-3" /> {stats.mismatch} مشكلة
                          </Badge>
                        )}
                        {stats.partial > 0 && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200">{stats.partial} جزئي</Badge>
                        )}
                        {stats.pagesVerified > 0 && (
                          <Badge className="bg-teal-100 text-teal-700 border-teal-200 gap-1">
                            <MapPin className="h-3 w-3" /> {stats.pagesVerified} صفحة مؤكدة
                          </Badge>
                        )}
                        {stats.pending > 0 && (
                          <Badge variant="outline" className="text-slate-500">{stats.pending} بانتظار</Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={verifyAll}
                        disabled={globalVerifying || rows.every((r) => r.verifying)}
                        className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      >
                        {globalVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                        تحقّق من الكل
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  {rows.map((row, i) => (
                    <CitationCard
                      key={row.id}
                      row={row}
                      index={i}
                      onVerify={verifyOne}
                      onSave={saveSource}
                      saving={savingId === row.id}
                      onVerifyPage={verifyPage}
                      onQuoteEdit={editQuote}
                    />
                  ))}
                </div>
              </>
            )}

            {rows.length === 0 && !extracting && (
              <HowItWorks />
            )}
          </div>

          {/* Right: sources + info */}
          <div className="space-y-6">
            <SourcesPanel />
            <InfoCard />
          </div>
        </div>
      </main>

      <Separator />
      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="container mx-auto px-4 py-4 max-w-6xl text-center text-xs text-slate-400">
          أداة مساعدة للباحثين · التحقق عبر Open Library API + بحث الويب · راجع دائماً المصدر الأصلي للتأكيد النهائي.
        </div>
      </footer>
    </div>
  )
}

function HowItWorks() {
  const steps = [
    { n: 1, t: 'الصق بحثك', d: 'ضع نص البحث مع التوثيقات داخل المتن أو الحواشي.' },
    { n: 2, t: 'استخراج ذكي', d: 'يستخرج الذكاء الاصطناعي كل توثيق: المؤلف، السنة، العنوان، رقم الصفحة، والاقتباس.' },
    { n: 3, t: 'بحث في المكتبات', d: 'تُبحث كل توثيقة في Open Library وبحث الويب للتأكد من وجود الكتاب والمؤلف.' },
    { n: 4, t: 'ارفع ملف المصدر', d: 'ارفع PDF أو Word للتحقق من رقم الصفحة فعلياً — الأداة تجد الاقتباس وتؤكد الصفحة الصحيحة.' },
  ]
  return (
    <Card className="border-dashed border-slate-300 bg-white/60">
      <CardContent className="pt-6">
        <h2 className="font-semibold text-slate-700 mb-4 text-center">كيف تعمل الأداة؟</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm">
                {s.n}
              </div>
              <div>
                <p className="font-medium text-slate-800 text-sm">{s.t}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function InfoCard() {
  return (
    <Card className="border-slate-200 shadow-sm bg-teal-50/40 border-teal-200">
      <CardContent className="pt-5">
        <h3 className="font-semibold text-teal-900 mb-2 flex items-center gap-1.5">
          <MapPin className="h-4 w-4" />
          التحقق من رقم الصفحة
        </h3>
        <ul className="text-xs text-teal-800 space-y-1.5 leading-relaxed list-disc pr-4">
          <li>ارفع ملف المصدر (PDF أو Word .docx) لكل توثيق تريد التأكد من رقم صفحته.</li>
          <li>الأداة تستخرج نص كل صفحة، ثم تبحث عن الاقتباس حرفياً وتحدد الصفحة الفعلية.</li>
          <li>إن كانت الصفحة المذكورة خاطئة، تُعرض الصفحة الصحيحة مع نسبة التطابق والمقطع المطابق.</li>
          <li>النص المقتبس قابل للتعديل يدوياً لضمان دقة المطابقة.</li>
          <li>تُحفظ بياناتك محلياً فقط ولا تُرسل لأي جهة خارجية.</li>
        </ul>
      </CardContent>
    </Card>
  )
}
