'use client'

import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  BookOpen,
  Copy,
  Check,
  FileText,
  Globe,
  Brain,
  ListChecks,
  Award,
  Sparkles,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import type {
  VerifyStatus,
  AlternativeReference,
} from '@/server/verify-engine/models'
import type { FormatStyle } from '@/server/verify-engine/models'
import { STYLE_LABELS } from '@/server/verify-engine/formatters'
import { generateCertificate, type CertificateData } from '@/lib/certificate'

interface ResultState {
  status: VerifyStatus
  message: string
  page: string | null
  alternative: AlternativeReference | null
}

interface CleanItem {
  raw: string
  parsedAuthor: string
  parsedYear: string
  parsedTitle: string
  status: 'VERIFIED' | 'SUSPICIOUS_HALLUCINATION' | 'ERROR'
  matchedSource: string | null
  recommendation: AlternativeReference | null
  note: string
}

const STATUS_CONFIG: Record<
  VerifyStatus,
  { bg: string; border: string; icon: LucideIcon; iconColor: string; titleColor: string }
> = {
  VERIFIED_EXACT: {
    bg: 'bg-white',
    border: 'border-slate-200',
    icon: CheckCircle,
    iconColor: 'text-emerald-600',
    titleColor: 'text-slate-800',
  },
  VERIFIED_CORRECTED: {
    bg: 'bg-white',
    border: 'border-slate-200',
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    titleColor: 'text-slate-800',
  },
  VERIFIED_SEMANTIC: {
    bg: 'bg-white',
    border: 'border-slate-200',
    icon: Brain,
    iconColor: 'text-violet-600',
    titleColor: 'text-slate-800',
  },
  ALTERNATIVE_FOUND: {
    bg: 'bg-white',
    border: 'border-slate-200',
    icon: RefreshCw,
    iconColor: 'text-indigo-600',
    titleColor: 'text-slate-800',
  },
  NOT_FOUND: {
    bg: 'bg-white',
    border: 'border-slate-200',
    icon: XCircle,
    iconColor: 'text-rose-600',
    titleColor: 'text-slate-800',
  },
  ERROR: {
    bg: 'bg-white',
    border: 'border-slate-200',
    icon: XCircle,
    iconColor: 'text-rose-600',
    titleColor: 'text-rose-800',
  },
}

type Tab = 'hybrid' | 'cleaner' | 'generator'

export function CitationVerificationCard() {
  const [tab, setTab] = useState<Tab>('hybrid')
  const [style, setStyle] = useState<FormatStyle>('apa7')

  return (
    <div className="max-w-3xl mx-auto" dir="rtl">
      {/* ── Premium minimal card (no ornamental frames) ── */}
      <div className="rounded-2xl bg-white shadow-[0_4px_24px_-8px_rgba(15,23,42,0.12)] border border-slate-200/70 overflow-hidden">
          <div className="p-6 sm:p-8">
            {/* Header — clean wordmark, no boxed icon */}
            <div className="text-center mb-7">
              <div className="inline-flex items-center gap-2.5 mb-3">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                <span className="text-[11px] font-bold tracking-[0.2em] text-emerald-700 uppercase">Academic Verification Platform</span>
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              </div>
              <h3 className="font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight leading-tight">
                منصة التحقق الأكاديمي الشاملة
              </h3>
              <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
                محرك هجين + مطابقة دلالية + تطهير هلوسة + مهندس تنسيق جامعي
              </p>
              <p className="text-xs text-slate-400 mt-3 font-medium">
                تطوير وإشراف <span className="text-slate-700 font-bold">Azzam</span>
              </p>
            </div>

            <div className="h-px bg-gradient-to-l from-transparent via-slate-200 to-transparent mb-6" />

            {/* ── Global style dropdown — minimal ── */}
            <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
              <label className="text-xs font-semibold text-slate-500 tracking-wide">
                دليل التنسيق
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as FormatStyle)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 outline-none cursor-pointer transition-colors"
              >
                {(Object.keys(STYLE_LABELS) as FormatStyle[]).map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            {/* ── Tabs — pill style, generous spacing ── */}
            <div className="flex gap-1.5 mb-7 p-1 bg-slate-100/70 rounded-xl">
              <TabButton
                active={tab === 'hybrid'}
                onClick={() => setTab('hybrid')}
                icon={<Brain className="w-4 h-4" />}
                label="تدقيق هجين"
              />
              <TabButton
                active={tab === 'cleaner'}
                onClick={() => setTab('cleaner')}
                icon={<ListChecks className="w-4 h-4" />}
                label="تطهير المراجع"
              />
              <TabButton
                active={tab === 'generator'}
                onClick={() => setTab('generator')}
                icon={<Sparkles className="w-4 h-4" />}
                label="توليد مراجع"
              />
            </div>

            {/* ── Tab content ── */}
            {tab === 'hybrid' ? (
              <HybridTab style={style} />
            ) : tab === 'cleaner' ? (
              <CleanerTab style={style} />
            ) : (
              <GeneratorTab style={style} />
            )}
          </div>
        </div>
    </div>
  )
}

// ── Tab 1: Hybrid + Semantic verification ────────────────────────────────────
function HybridTab({ style }: { style: FormatStyle }) {
  const [author, setAuthor] = useState('')
  const [quote, setQuote] = useState('')
  const [page, setPage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [semantic, setSemantic] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ResultState | null>(null)
  const [copied, setCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleProcess = async () => {
    if (!file || !author || !quote) {
      setResult({
        status: 'ERROR',
        message: 'الرجاء رفع ملف المرجع (PDF)، وإدخال اسم العالم ونص الاقتباس.',
        page: null,
        alternative: null,
      })
      return
    }
    setIsLoading(true)
    setResult(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('author', author)
    formData.append('quote', quote)
    formData.append('page', page)
    if (semantic) formData.append('semantic', 'true')

    try {
      const response = await fetch('/api/verify-engine', { method: 'POST', body: formData })
      const data = (await response.json()) as ResultState
      setResult(data)
    } catch {
      setResult({
        status: 'ERROR',
        message: 'فشل الاتصال بمحرك التحقق الهجين.',
        page: null,
        alternative: null,
      })
    } finally {
      setIsLoading(false)
      // Refresh the "مكتبتي" panel so the new audit record appears.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('audits-changed'))
      }
    }
  }

  const copyApa = () => {
    if (!result?.alternative) return
    // Format the alternative in the globally selected style
    import('@/server/verify-engine/formatters').then(({ formatAlternative }) => {
      const text = formatAlternative(result.alternative!, style)
      navigator.clipboard?.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      })
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.name.toLowerCase().endsWith('.pdf')) setFile(f)
  }

  const config = result ? STATUS_CONFIG[result.status] : null
  const StatusIcon = config?.icon

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">اسم العالم / المؤلف</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="مثال: أحمد شوقي أو Smith"
            className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all bg-slate-50/50"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            رقم الصفحة المتوقع <span className="text-slate-400 font-normal">(اختياري)</span>
          </label>
          <input
            type="text"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder="مثال: 45"
            className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all bg-slate-50/50"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">النص المقتبس (الذي تريد تدقيقه)</label>
        <textarea
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          rows={3}
          placeholder="اكتب الاقتباس الحرفي أو الفكرة هنا..."
          className="w-full p-3 border border-slate-300 rounded-xl text-sm italic focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all bg-slate-50/50 resize-y"
        />
      </div>

      {/* Semantic toggle — Module 1 */}
      <label className="flex items-center gap-3 p-3 rounded-xl border border-violet-200 bg-violet-50/50 cursor-pointer hover:bg-violet-50 transition-colors">
        <input
          type="checkbox"
          checked={semantic}
          onChange={(e) => setSemantic(e.target.checked)}
          className="w-4 h-4 accent-violet-600"
        />
        <Brain className="w-4 h-4 text-violet-600" />
        <div className="flex-1">
          <span className="text-sm font-bold text-violet-900">تفعيل الفحص الدلالي / بالمعنى</span>
          <p className="text-xs text-violet-700">لإعادة الصياغة (Paraphrasing) — يطابق الفكرة لا الكلمات</p>
        </div>
      </label>

      {/* File upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`p-5 border-2 border-dashed rounded-xl cursor-pointer transition-all flex flex-col sm:flex-row items-center justify-between gap-4 ${
          dragOver ? 'border-amber-500 bg-amber-50' : file ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-300 bg-slate-50/50 hover:border-slate-500'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          accept=".pdf,application/pdf"
          className="hidden"
        />
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${file ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
            {file ? <CheckCircle className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-800">الكتاب المصدر (PDF)</span>
            <span className="text-xs text-slate-500">{file ? `✓ ${file.name}` : 'للبحث واستخراج رقم الصفحة الحقيقي من الهوامش'}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
          className="bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm py-2.5 px-5 rounded-xl border border-slate-300 shadow-sm transition-all flex items-center gap-2 shrink-0"
        >
          <Upload className="w-4 h-4" /> ارفع المرجع
        </button>
      </div>

      <button
        onClick={handleProcess}
        disabled={isLoading}
        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-base"
      >
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle className="w-6 h-6" />}
        {isLoading ? 'يتم الآن فحص الملف والمكتبات العالمية...' : 'ابدأ التدقيق والتحقق الشامل'}
      </button>

      {isLoading && (
        <div className="space-y-3">
          <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
          <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2" />
          <div className="h-20 bg-slate-200 rounded animate-pulse" />
        </div>
      )}

      {result && !isLoading && config && StatusIcon && (
        <div className={`mt-2 p-5 rounded-2xl border-2 ${config.bg} ${config.border}`}>
          <div className="flex items-center gap-3 font-bold text-lg mb-3">
            <StatusIcon className={`w-6 h-6 shrink-0 ${config.iconColor}`} />
            <span className={config.titleColor}>{result.message}</span>
          </div>

          {result.page && (result.status === 'VERIFIED_EXACT' || result.status === 'VERIFIED_CORRECTED' || result.status === 'VERIFIED_SEMANTIC') && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm mt-3">
              <span className="font-medium text-slate-600">رقم الصفحة الحقيقي والمطابق:</span>
              <span className="font-bold text-xl bg-emerald-100 border border-emerald-200 text-emerald-800 px-4 py-1.5 rounded-lg">
                صـ {result.page}
              </span>
            </div>
          )}

          {result.status === 'ALTERNATIVE_FOUND' && result.alternative && (
            <div className="mt-4 bg-white p-5 rounded-xl border border-indigo-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-indigo-100">
                <Globe className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-bold text-indigo-700">✓ التوثيق المعتمد عالمياً (صحيح 100%):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700 mb-4">
                <p><strong>العنوان:</strong> {result.alternative.title}</p>
                <p><strong>المؤلف:</strong> {result.alternative.author}</p>
                <p><strong>السنة:</strong> {result.alternative.year}</p>
                <p><strong>الناشر:</strong> {result.alternative.publisher || '—'}</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500">التوثيق الجاهز للنسخ ({STYLE_LABELS[style]}):</span>
                  <button onClick={copyApa} className="text-xs px-3 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 flex items-center gap-1 transition-colors">
                    {copied ? <><Check className="h-3 w-3" /> نُسخ</> : <><Copy className="h-3 w-3" /> نسخ</>}
                  </button>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg text-sm font-mono text-slate-800 select-all border border-slate-200" dir="ltr">
                  <FormattedAlternative alt={result.alternative} style={style} />
                </div>
              </div>
            </div>
          )}

          {/* Certificate download button (P2) */}
          {result.status !== 'ERROR' && (
            <button
              onClick={() =>
                generateCertificate({
                  totalChecked: 1,
                  authenticatedCount: ['VERIFIED_EXACT', 'VERIFIED_CORRECTED', 'VERIFIED_SEMANTIC', 'ALTERNATIVE_FOUND'].includes(result.status) ? 1 : 0,
                  suspiciousCount: ['NOT_FOUND'].includes(result.status) ? 1 : 0,
                  items: [
                    {
                      quote,
                      author,
                      status: result.status,
                      verifiedTitle: result.alternative?.title || null,
                      verifiedAuthor: result.alternative?.author || author,
                      verifiedPage: result.page,
                      fullApa: result.alternative?.fullApa || null,
                    },
                  ],
                })
              }
              className="mt-4 w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Award className="w-5 h-5" />
              تحميل شهادة فحص الأمانة العلمية
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Bibliography hallucination cleaner ────────────────────────────────
function CleanerTab({ style }: { style: FormatStyle }) {
  const [raw, setRaw] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [items, setItems] = useState<CleanItem[] | null>(null)
  const [stats, setStats] = useState<{ total: number; verified: number; suspicious: number } | null>(null)

  const handleClean = async () => {
    if (!raw.trim()) return
    setIsLoading(true)
    setItems(null)
    setStats(null)
    try {
      const res = await fetch('/api/clean-bibliography', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw, style }),
      })
      const data = await res.json()
      if (data.ok) {
        setItems(data.items)
        setStats({ total: data.total, verified: data.verifiedCount, suspicious: data.suspiciousCount })
      } else {
        setItems([{ raw: 'خطأ', parsedAuthor: '', parsedYear: '', parsedTitle: '', status: 'ERROR', matchedSource: null, recommendation: null, note: data.error || 'فشل الفحص.' }])
      }
    } catch {
      setItems([{ raw: 'خطأ', parsedAuthor: '', parsedYear: '', parsedTitle: '', status: 'ERROR', matchedSource: null, recommendation: null, note: 'فشل الاتصال.' }])
    } finally {
      setIsLoading(false)
      // Refresh the "مكتبتي" panel so the new batch appears.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('audits-changed'))
      }
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">
          الصق قائمة المراجع كاملة (كل مرجع في سطر)
        </label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder={`مثال:\nSmith, J. (2018). Fundamentals of Machine Learning. MIT Press.\nTaleb, N. (2010). The Black Swan. Random House.\nAlfakhri, M. (2099). Quantum Bibliography Theory. Fake Press.`}
          className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all bg-slate-50/50 resize-y font-mono"
        />
        <p className="text-xs text-slate-500 mt-1">{raw.length} حرف · {raw.split(/\r?\n/).filter((l) => l.trim()).length} سطر</p>
      </div>

      <button
        onClick={handleClean}
        disabled={isLoading || !raw.trim()}
        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-base"
      >
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ListChecks className="w-6 h-6" />}
        {isLoading ? 'جارٍ فحص كل مرجع عبر المكتبات الثلاث...' : 'ابدأ تطهير وتنظيف المراجع'}
      </button>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="إجمالي" value={stats.total} cls="bg-slate-100 text-slate-800" />
          <StatCard label="موثّق ✓" value={stats.verified} cls="bg-emerald-100 text-emerald-800" />
          <StatCard label="مشبوه ⚠" value={stats.suspicious} cls="bg-rose-100 text-rose-800" />
        </div>
      )}

      {items && !isLoading && (
        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
          {items.map((item, i) => (
            <CleanItemCard key={i} item={item} style={style} />
          ))}
        </div>
      )}

      {/* Certificate download button (P2) */}
      {items && !isLoading && stats && (
        <button
          onClick={() => {
            const certData: CertificateData = {
              totalChecked: stats.total,
              authenticatedCount: stats.verified,
              suspiciousCount: stats.suspicious,
              items: items.map((item) => ({
                quote: item.parsedTitle,
                author: item.parsedAuthor,
                status: item.status === 'VERIFIED' ? 'VERIFIED_EXACT' : item.status === 'SUSPICIOUS_HALLUCINATION' ? 'HALLUCINATION' : 'ERROR',
                verifiedTitle: item.recommendation?.title || item.parsedTitle,
                verifiedAuthor: item.recommendation?.author || item.parsedAuthor,
                verifiedPage: null,
                fullApa: item.recommendation?.fullApa || null,
              })),
            }
            generateCertificate(certData)
          }}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-base"
        >
          <Award className="w-5 h-5" />
          تحميل شهادة فحص الأمانة العلمية
        </button>
      )}
    </div>
  )
}

// ── Tab 3: Reference Generator (for research with no references) ─────────────
interface GeneratedRef {
  topic: string
  title: string
  authors: string[]
  year: string
  publisher: string
  isbn: string | null
  doi: string | null
  url: string
  verifiedBy: 'google_books' | 'open_library' | 'crossref'
  page: number | null
  pageConfirmed: boolean
  formatted: string
  relevanceNote: string
}

function GeneratorTab({ style }: { style: FormatStyle }) {
  const [researchText, setResearchText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{
    total: number
    references: GeneratedRef[]
    extractedTopics: string[]
    note: string
  } | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const handleGenerate = async () => {
    if (!researchText.trim() || researchText.trim().length < 50) return
    setIsLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/generate-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ researchText, style }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult({
          total: data.total,
          references: data.references,
          extractedTopics: data.extractedTopics,
          note: data.note,
        })
      } else {
        setResult({ total: 0, references: [], extractedTopics: [], note: data.error || 'فشل التوليد.' })
      }
    } catch {
      setResult({ total: 0, references: [], extractedTopics: [], note: 'فشل الاتصال.' })
    } finally {
      setIsLoading(false)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('audits-changed'))
      }
    }
  }

  const copyRef = (text: string, idx: number) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 1500)
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
        <p className="text-sm text-violet-900 leading-relaxed">
          <Sparkles className="w-4 h-4 inline ml-1" />
          الصق فقرة من بحثك <strong>بدون أي مراجع</strong> — سيحلل النظام محتواها، يستخرج المواضيع
          الرئيسية، ويبحث في المكتبات العالمية عن كتب حقيقية موثّقة 100% تدعم أفكار بحثك.
        </p>
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">
          الصق نص البحث (فقرة أو أكثر بدون مراجع)
        </label>
        <textarea
          value={researchText}
          onChange={(e) => setResearchText(e.target.value)}
          rows={6}
          placeholder="مثال: يُعدّ التعلم العميق أحد فروع الذكاء الاصطناعي الذي حقق تقدماً ملحوظاً في السنوات الأخيرة، حيث أثبتت الشبكات العصبية الاصطناعية قدرتها على تمثيل الدوال المعقدة بدقة عالية..."
          className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all bg-slate-50/50 resize-y"
        />
        <p className="text-xs text-slate-500 mt-1">{researchText.length} حرف</p>
      </div>

      <button
        onClick={handleGenerate}
        disabled={isLoading || researchText.trim().length < 50}
        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-base"
      >
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
        {isLoading ? 'يحلّل المحتوى ويبحث في المكتبات العالمية...' : 'ولّد مراجع حقيقية لبحثي'}
      </button>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {result && !isLoading && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm text-slate-700 leading-relaxed">{result.note}</p>
            {result.extractedTopics.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-xs text-slate-500">المواضيع المستخرجة:</span>
                {result.extractedTopics.map((t, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
            )}
          </div>

          {result.references.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-800">{result.total} مرجع حقيقي موثّق</p>
                <button
                  onClick={() =>
                    generateCertificate({
                      totalChecked: result.total,
                      authenticatedCount: result.total,
                      suspiciousCount: 0,
                      items: result.references.map((r) => ({
                        quote: r.topic,
                        author: r.authors.join(', '),
                        status: 'ALTERNATIVE_FOUND',
                        verifiedTitle: r.title,
                        verifiedAuthor: r.authors.join(', '),
                        verifiedPage: r.page ? String(r.page) : null,
                        fullApa: r.formatted,
                      })),
                    })
                  }
                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1 font-bold"
                >
                  <Award className="h-3.5 w-3.5" /> تحميل شهادة
                </button>
              </div>
              <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {result.references.map((ref, i) => (
                  <div key={i} className="rounded-xl border border-emerald-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <Badge className="text-xs bg-violet-100 text-violet-800 border-violet-200 shrink-0">
                        {i + 1}. {ref.topic}
                      </Badge>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <Badge className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200 gap-1" title="موثّق هيكلياً في مصدر رسمي">
                          <ShieldCheck className="h-3 w-3" /> {ref.verifiedBy === 'google_books' ? 'Google Books' : ref.verifiedBy === 'open_library' ? 'Open Library' : 'Crossref DOI'}
                        </Badge>
                        {ref.pageConfirmed && ref.page && (
                          <Badge className="text-xs bg-teal-100 text-teal-800 border-teal-200 gap-1">
                            <CheckCircle className="h-3 w-3" /> صـ {ref.page}
                          </Badge>
                        )}
                        <button
                          onClick={() => copyRef(ref.formatted, i)}
                          className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1"
                        >
                          {copiedIdx === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedIdx === i ? 'نُسخ' : 'نسخ'}
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{ref.title}</p>
                    <p className="text-xs text-slate-600">
                      {ref.authors.join('، ') || 'بدون مؤلف'} · {ref.year}
                      {ref.publisher ? ` · ${ref.publisher}` : ''}
                      {ref.isbn ? ` · ISBN: ${ref.isbn}` : ''}
                      {ref.doi ? ` · DOI: ${ref.doi}` : ''}
                    </p>
                    {ref.url && (
                      <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline mt-0.5 inline-block">
                        🔗 المصدر الرسمي
                      </a>
                    )}
                    {ref.relevanceNote && (
                      <p className="text-xs text-violet-700 mt-1 italic">💡 {ref.relevanceNote}</p>
                    )}
                    {!ref.pageConfirmed && (
                      <p className="text-[10px] text-amber-600 mt-1">
                        ⚠️ المرجع حقيقي وموثّق، لكن لم يُعثر على رقم صفحة — راجع فهرس الكتاب يدوياً
                      </p>
                    )}
                    <div className="mt-2 bg-slate-50 rounded px-2 py-1.5 text-xs font-mono text-slate-700 border border-slate-200" dir="ltr">
                      {ref.formatted}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CleanItemCard({ item, style }: { item: CleanItem; style: FormatStyle }) {
  const tone =
    item.status === 'VERIFIED'
      ? 'border-emerald-200 bg-emerald-50/40'
      : item.status === 'SUSPICIOUS_HALLUCINATION'
        ? 'border-rose-300 bg-rose-50/40'
        : 'border-slate-200 bg-slate-50/40'
  const badge =
    item.status === 'VERIFIED'
      ? 'bg-emerald-200 text-emerald-900 border-emerald-300'
      : item.status === 'SUSPICIOUS_HALLUCINATION'
        ? 'bg-rose-200 text-rose-900 border-rose-300'
        : 'bg-slate-200 text-slate-700 border-slate-300'
  const label =
    item.status === 'VERIFIED'
      ? 'موثّق ✓'
      : item.status === 'SUSPICIOUS_HALLUCINATION'
        ? 'هلوسة وهمية ⚠'
        : 'خطأ'
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-slate-900 truncate flex-1">{item.raw}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-bold shrink-0 ${badge}`}>{label}</span>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{item.note}</p>
      {item.recommendation && (
        <div className="mt-2 pt-2 border-t border-rose-200 bg-white/60 rounded-lg p-2">
          <p className="text-xs font-bold text-rose-800 mb-1">💡 بديل حقيقي موثّق:</p>
          <p className="text-xs text-slate-700">«{item.recommendation.title}» — {item.recommendation.author}{item.recommendation.year ? ` (${item.recommendation.year})` : ''}</p>
          <div className="mt-1 bg-slate-50 rounded px-2 py-1 text-[11px] font-mono text-slate-700 border border-slate-200" dir="ltr">
            <FormattedAlternative alt={item.recommendation} style={style} />
          </div>
        </div>
      )}
    </div>
  )
}

// Renders the alternative in the chosen style (lazy-formatted client-side).
function FormattedAlternative({ alt, style }: { alt: AlternativeReference; style: FormatStyle }) {
  const [text, setText] = useState<string>(alt.fullApa)
  useRef(null)
  // dynamically import the formatter (keeps the bundle thin)
  import('@/server/verify-engine/formatters').then(({ formatAlternative }) => {
    setText(formatAlternative(alt, style))
  })
  return <>{text}</>
}

// ── small UI atoms ────────────────────────────────────────────────────────────
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-semibold text-[13px] transition-all ${
        active
          ? 'bg-white text-emerald-700 shadow-sm'
          : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function StatCard({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-xl p-3 text-center border border-current/10 ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-80">{label}</p>
    </div>
  )
}
