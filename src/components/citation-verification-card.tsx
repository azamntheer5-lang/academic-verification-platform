'use client'

import { useRef, useState } from 'react'
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
  type LucideIcon,
} from 'lucide-react'
import type { VerifyStatus, AlternativeReference } from '@/server/verify-engine/models'

interface ResultState {
  status: VerifyStatus
  message: string
  page: string | null
  alternative: AlternativeReference | null
}

const STATUS_CONFIG: Record<
  VerifyStatus,
  { bg: string; border: string; icon: LucideIcon; iconColor: string; titleColor: string }
> = {
  VERIFIED_EXACT: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    icon: CheckCircle,
    iconColor: 'text-emerald-600',
    titleColor: 'text-emerald-800',
  },
  VERIFIED_CORRECTED: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-800',
  },
  ALTERNATIVE_FOUND: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-300',
    icon: RefreshCw,
    iconColor: 'text-indigo-600',
    titleColor: 'text-indigo-800',
  },
  NOT_FOUND: {
    bg: 'bg-rose-50',
    border: 'border-rose-300',
    icon: XCircle,
    iconColor: 'text-rose-600',
    titleColor: 'text-rose-800',
  },
  ERROR: {
    bg: 'bg-rose-50',
    border: 'border-rose-300',
    icon: XCircle,
    iconColor: 'text-rose-600',
    titleColor: 'text-rose-800',
  },
}

export function CitationVerificationCard() {
  const [author, setAuthor] = useState('')
  const [quote, setQuote] = useState('')
  const [page, setPage] = useState('')
  const [file, setFile] = useState<File | null>(null)
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

    try {
      const response = await fetch('/api/verify-engine', {
        method: 'POST',
        body: formData,
      })
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
    }
  }

  const copyApa = () => {
    if (!result?.alternative?.fullApa) return
    navigator.clipboard?.writeText(result.alternative.fullApa).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
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
    <div className="relative max-w-3xl mx-auto" dir="rtl">
      {/* ── Premium geometric frame ──────────────────────────────────────────── */}
      {/* Outer ornamental border emulating a thesis cover page */}
      <div className="relative">
        {/* Corner ornaments */}
        <CornerOrnament className="top-0 right-0 border-t-2 border-r-2 rounded-tr-lg" />
        <CornerOrnament className="top-0 left-0 border-t-2 border-l-2 rounded-tl-lg" />
        <CornerOrnament className="bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg" />
        <CornerOrnament className="bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg" />

        <div className="border border-slate-300 rounded-xl bg-white shadow-xl overflow-hidden">
          {/* Inner double-line accent */}
          <div className="border-b-2 border-slate-800/80" />
          <div className="border-b border-amber-500/60" />

          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="text-center mb-7 pb-5 border-b border-slate-200">
              <div className="inline-flex items-center justify-center gap-3 mb-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-amber-400">
                  <BookOpen className="w-6 h-6" />
                </div>
              </div>
              <h3 className="font-bold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                نظام التحقق الهجين
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                تشريح عميق للملف + اتصال سحابي بالمكتبات العالمية · دقة 100%
              </p>
            </div>

            {/* Input Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  اسم العالم / المؤلف
                </label>
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

            <div className="mb-5">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                النص المقتبس (الذي تريد تدقيقه)
              </label>
              <textarea
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                rows={3}
                placeholder="اكتب الاقتباس الحرفي أو الفكرة هنا..."
                className="w-full p-3 border border-slate-300 rounded-xl text-sm italic focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all bg-slate-50/50 resize-y"
              />
            </div>

            {/* File Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mb-6 p-5 border-2 border-dashed rounded-xl cursor-pointer transition-all flex flex-col sm:flex-row items-center justify-between gap-4 ${
                dragOver
                  ? 'border-amber-500 bg-amber-50'
                  : file
                    ? 'border-emerald-400 bg-emerald-50/50'
                    : 'border-slate-300 bg-slate-50/50 hover:border-slate-500'
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
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                    file ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {file ? <CheckCircle className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-800">الكتاب المصدر (PDF)</span>
                  <span className="text-xs text-slate-500">
                    {file ? `✓ ${file.name}` : 'للبحث واستخراج رقم الصفحة الحقيقي من الهوامش'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
                className="bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm py-2.5 px-5 rounded-xl border border-slate-300 shadow-sm transition-all flex items-center gap-2 shrink-0"
              >
                <Upload className="w-4 h-4" /> ارفع المرجع
              </button>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleProcess}
              disabled={isLoading}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-70 text-white font-bold py-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-lg"
            >
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <CheckCircle className="w-6 h-6" />
              )}
              {isLoading ? 'يتم الآن فحص الملف والمكتبات العالمية...' : 'ابدأ التدقيق والتحقق الشامل'}
            </button>

            {/* Skeleton loader while waiting */}
            {isLoading && (
              <div className="mt-6 space-y-3">
                <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2" />
                <div className="h-20 bg-slate-200 rounded animate-pulse" />
              </div>
            )}

            {/* Results Display */}
            {result && !isLoading && config && StatusIcon && (
              <div className={`mt-6 p-5 rounded-2xl border-2 ${config.bg} ${config.border}`}>
                <div className="flex items-center gap-3 font-bold text-lg mb-3">
                  <StatusIcon className={`w-6 h-6 shrink-0 ${config.iconColor}`} />
                  <span className={config.titleColor}>{result.message}</span>
                </div>

                {/* Verified page (from file) */}
                {result.page &&
                  (result.status === 'VERIFIED_EXACT' || result.status === 'VERIFIED_CORRECTED') && (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm mt-3">
                      <span className="font-medium text-slate-600">رقم الصفحة الحقيقي والمطابق:</span>
                      <span className="font-bold text-xl bg-emerald-100 border border-emerald-200 text-emerald-800 px-4 py-1.5 rounded-lg">
                        صـ {result.page}
                      </span>
                    </div>
                  )}

                {/* Alternative from global library */}
                {result.status === 'ALTERNATIVE_FOUND' && result.alternative && (
                  <div className="mt-4 bg-white p-5 rounded-xl border border-indigo-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-indigo-100">
                      <Globe className="w-4 h-4 text-indigo-600" />
                      <span className="text-sm font-bold text-indigo-700">
                        ✓ التوثيق المعتمد عالمياً (صحيح 100%):
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700 mb-4">
                      <p>
                        <strong>العنوان المعتمد:</strong> {result.alternative.title}
                      </p>
                      <p>
                        <strong>المؤلف الرسمي:</strong> {result.alternative.author}
                      </p>
                      <p>
                        <strong>سنة النشر:</strong> {result.alternative.year}
                      </p>
                      <p>
                        <strong>الناشر:</strong> {result.alternative.publisher || '—'}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500">
                          التوثيق الجاهز للنسخ (APA 7):
                        </span>
                        <button
                          onClick={copyApa}
                          className="text-xs px-3 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 flex items-center gap-1 transition-colors"
                        >
                          {copied ? (
                            <>
                              <Check className="h-3 w-3" /> نُسخ
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" /> نسخ APA
                            </>
                          )}
                        </button>
                      </div>
                      <div
                        className="bg-slate-50 p-3 rounded-lg text-sm font-mono text-slate-800 select-all border border-slate-200"
                        dir="ltr"
                      >
                        {result.alternative.fullApa}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Inner double-line accent (bottom) */}
          <div className="border-t border-amber-500/60" />
          <div className="border-t-2 border-slate-800/80" />
        </div>
      </div>
    </div>
  )
}

// Ornamental corner piece — gives the container its premium academic frame
function CornerOrnament({ className }: { className: string }) {
  return (
    <div
      className={`absolute z-10 h-7 w-7 border-amber-500 pointer-events-none ${className}`}
      aria-hidden
    />
  )
}
