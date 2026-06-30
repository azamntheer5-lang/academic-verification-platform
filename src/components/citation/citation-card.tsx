'use client'

import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  BookOpen,
  ExternalLink,
  Search,
  Save,
  Loader2,
  FileText,
  Upload,
  FileCheck2,
  MapPin,
  X,
  Edit3,
} from 'lucide-react'
import { StatusBadge, VerifyingBadge } from './status-badge'
import type { CitationRow, LibraryHit, PageVerifyResult } from '@/lib/types'

interface Props {
  row: CitationRow
  index: number
  onVerify: (id: string) => void
  onSave: (row: CitationRow) => void
  saving?: boolean
  onVerifyPage: (id: string, file: File, quote: string, claimedPage: number | null) => void
  onQuoteEdit: (id: string, quote: string) => void
}

function HitCard({ hit }: { hit: LibraryHit }) {
  return (
    <a
      href={hit.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-md border border-slate-200 bg-slate-50/60 p-3 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-800 truncate" title={hit.title}>
            {hit.title || '(بدون عنوان)'}
          </p>
          {hit.authors.length > 0 && (
            <p className="text-sm text-slate-600 truncate">{hit.authors.join('، ')}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <Badge variant="secondary" className="text-xs">
              {hit.source === 'openlibrary' ? 'Open Library' : 'ويب'}
            </Badge>
            {hit.year && <Badge variant="outline" className="text-xs">{hit.year}</Badge>}
            {hit.publisher && (
              <Badge variant="outline" className="text-xs font-normal truncate max-w-[140px]">
                {hit.publisher}
              </Badge>
            )}
          </div>
        </div>
        <ExternalLink className="h-4 w-4 text-slate-400 shrink-0" />
      </div>
    </a>
  )
}

export function CitationCard({
  row,
  index,
  onVerify,
  onSave,
  saving,
  onVerifyPage,
  onQuoteEdit,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [editingQuote, setEditingQuote] = useState(false)
  const [quoteDraft, setQuoteDraft] = useState(row.quote || '')

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFileName(f.name)
      onVerifyPage(row.id, f, row.quote || '', row.page ?? null)
    }
  }

  const dropZone = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) {
      setFileName(f.name)
      onVerifyPage(row.id, f, row.quote || '', row.page ?? null)
    }
  }

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="pb-3 bg-slate-50/50">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-sm font-bold">
              {index + 1}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 truncate">
                {row.author || 'بدون مؤلف'}
                {row.year && <span className="text-slate-500 font-normal"> · {row.year}</span>}
              </h3>
              {row.title && (
                <p className="text-sm text-slate-600 italic truncate" title={row.title}>
                  «{row.title}»
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {row.verifying ? <VerifyingBadge /> : <StatusBadge status={row.status} />}
            {row.pageVerify && row.pageVerify.status !== 'pending' && (
              <PageStatusBadge status={row.pageVerify.status} />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* metadata grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Meta label="المؤلف" value={row.author || '—'} />
          <Meta label="السنة" value={row.year || '—'} />
          <Meta label="الصفحة" value={row.page ? `ص. ${row.page}` : 'غير مذكورة'} />
          <Meta label="العنوان" value={row.title || 'غير مذكور'} full />
        </div>

        {/* quote — editable so the user can paste the exact passage to verify */}
        <div className="rounded-md border-r-4 border-emerald-400 bg-emerald-50/50 px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-emerald-700 font-medium">النص المقتبس (للتحقق من الصفحة)</p>
            {!editingQuote && (
              <button
                onClick={() => { setQuoteDraft(row.quote || ''); setEditingQuote(true) }}
                className="text-xs text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
              >
                <Edit3 className="h-3 w-3" /> تعديل
              </button>
            )}
          </div>
          {editingQuote ? (
            <div className="space-y-2">
              <Textarea
                value={quoteDraft}
                onChange={(e) => setQuoteDraft(e.target.value)}
                placeholder="الصق هنا النص المقتبس حرفياً كما ورد في المصدر للتحقق من رقم صفحته…"
                className="min-h-[80px] text-sm bg-white"
                dir="rtl"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onQuoteEdit(row.id, quoteDraft.trim())
                    setEditingQuote(false)
                  }}
                  disabled={!quoteDraft.trim()}
                >
                  حفظ الاقتباس
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingQuote(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          ) : row.quote ? (
            <p className="text-sm text-slate-700 leading-relaxed font-[var(--font-amiri)]">“{row.quote}”</p>
          ) : (
            <p className="text-xs text-slate-400 italic">
              لم يُستخرج اقتباس حرفي. اضغط «تعديل» والصق النص المقتبس للتحقق من رقم صفحته.
            </p>
          )}
        </div>

        {row.context && !row.quote && (
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500 mb-1">السياق</p>
            <p className="text-sm text-slate-600 leading-relaxed">{row.context}</p>
          </div>
        )}

        {row.result && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-slate-700">نتيجة التحقق في المكتبات</p>
                <span className="text-xs text-slate-500">
                  نسبة الثقة: {Math.round(row.result.confidence * 100)}%
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed bg-amber-50/60 border border-amber-200 rounded-md px-3 py-2">
                {row.result.note}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <MatchChip ok={row.result.authorMatch} label="المؤلف" />
                <MatchChip ok={row.result.titleMatch} label="العنوان" />
                <MatchChip ok={row.result.yearPlausible} label="السنة" />
                <MatchChip
                  ok={row.pageVerify?.status === 'verified'}
                  label="رقم الصفحة"
                  muted={!row.pageVerify || row.pageVerify.status === 'pending'}
                />
              </div>
            </div>

            {row.result.allHits.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  نتائج المكتبات ({row.result.allHits.length})
                </p>
                <ScrollArea className="max-h-64 w-full">
                  <div className="space-y-2 pr-1">
                    {row.result.allHits.map((h, i) => (
                      <HitCard key={i} hit={h} />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </>
        )}

        {/* Page verification result */}
        {row.pageVerify && row.pageVerify.status !== 'pending' && (
          <PageVerifySection pv={row.pageVerify} fileName={fileName} />
        )}

        {/* Upload zone + action buttons */}
        <div className="space-y-2 pt-1">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={dropZone}
            className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors p-3 text-center cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleFile}
            />
            {row.pageVerifying ? (
              <div className="flex items-center justify-center gap-2 text-sky-700 text-sm py-1">
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ استخراج نص الملف والتحقق من رقم الصفحة…
              </div>
            ) : row.pageVerify?.status === 'verified' && fileName ? (
              <div className="flex items-center justify-center gap-2 text-emerald-700 text-sm py-1">
                <FileCheck2 className="h-4 w-4" />
                تم التحقق من «{fileName}» — الصفحة مؤكدة
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 py-1">
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <Upload className="h-4 w-4" />
                  ارفع ملف المصدر (PDF أو Word) للتحقق من رقم الصفحة
                </div>
                <p className="text-xs text-slate-400">اضغط للاختيار أو اسحب الملف هنا</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => onVerify(row.id)}
              disabled={row.verifying}
              className="gap-1.5"
            >
              {row.verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {row.result ? 'إعادة التحقق' : 'تحقّق في المكتبات'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSave(row)}
              disabled={saving}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              احفظ في مكتبتي
            </Button>
            {fileName && !row.pageVerifying && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {fileName}
                <button
                  onClick={() => setFileName(null)}
                  className="text-slate-400 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PageStatusBadge({ status }: { status: PageVerifyResult['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    verified: { label: 'الصفحة مؤكدة', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    wrong_page: { label: 'صفحة خاطئة', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
    not_found: { label: 'الاقتباس غير موجود', cls: 'bg-red-100 text-red-800 border-red-300' },
    no_quote: { label: 'لا يوجد اقتباس', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
  }
  const m = map[status] || { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-300' }
  return (
    <Badge variant="outline" className={`${m.cls} gap-1 font-medium`}>
      <MapPin className="h-3.5 w-3.5" />
      {m.label}
    </Badge>
  )
}

function PageVerifySection({ pv, fileName }: { pv: PageVerifyResult; fileName?: string | null }) {
  const tone =
    pv.status === 'verified'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : pv.status === 'wrong_page'
        ? 'bg-orange-50 border-orange-200 text-orange-900'
        : pv.status === 'not_found'
          ? 'bg-red-50 border-red-200 text-red-900'
          : 'bg-slate-50 border-slate-200 text-slate-700'
  return (
    <div className={`rounded-md border px-3 py-2 space-y-2 ${tone}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <MapPin className="h-4 w-4" />
          التحقق من رقم الصفحة {fileName ? `· ${fileName}` : ''}
        </p>
        <span className="text-xs opacity-70">بحث في {pv.searchedPages} صفحة</span>
      </div>
      <p className="text-sm leading-relaxed">{pv.note}</p>
      {pv.matchedPage !== null && (
        <div className="flex flex-wrap gap-2 text-xs">
          {pv.claimedPage !== null && (
            <Badge variant="outline" className="bg-white/60">
              الصفحة المذكورة: {pv.claimedPage}
            </Badge>
          )}
          <Badge variant="outline" className="bg-white/60">
            الصفحة الفعلية: {pv.matchedPage}
          </Badge>
          <Badge variant="outline" className="bg-white/60">
            نسبة التطابق: {Math.round(pv.matchScore * 100)}%
          </Badge>
          {pv.exactMatch && (
            <Badge className="bg-emerald-200 text-emerald-900 border-emerald-300">تطابق حرفي ✓</Badge>
          )}
        </div>
      )}
      {pv.snippet && (
        <div className="mt-1 rounded bg-white/70 border border-white/40 px-2 py-1.5">
          <p className="text-xs opacity-60 mb-0.5">المقطع المطابق من الملف:</p>
          <p className="text-xs leading-relaxed line-clamp-3">{pv.snippet}</p>
        </div>
      )}
      {pv.candidates.length > 1 && (
        <details className="text-xs">
          <summary className="cursor-pointer opacity-70 hover:opacity-100">
            أعلى الصفحات المطابقة ({pv.candidates.length})
          </summary>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {pv.candidates.map((c) => (
              <Badge key={c.page} variant="outline" className="bg-white/60 text-xs">
                ص.{c.page}: {Math.round(c.score * 100)}%
              </Badge>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function Meta({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2 sm:col-span-4' : ''}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-slate-700 truncate" title={value}>{value}</p>
    </div>
  )
}

function MatchChip({ ok, label, muted }: { ok: boolean; label: string; muted?: boolean }) {
  if (muted) {
    return (
      <Badge variant="outline" className="text-xs text-slate-400 border-slate-200 bg-slate-50">
        ○ {label}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className={`text-xs ${ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}
    >
      {ok ? '✓' : '✗'} {label}
    </Badge>
  )
}
