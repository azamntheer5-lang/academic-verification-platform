'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BookOpen, ExternalLink, Search, Save, Loader2, FileText } from 'lucide-react'
import { StatusBadge, VerifyingBadge } from './status-badge'
import type { CitationRow, LibraryHit } from '@/lib/types'

interface Props {
  row: CitationRow
  index: number
  onVerify: (id: string) => void
  onSave: (row: CitationRow) => void
  saving?: boolean
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

export function CitationCard({ row, index, onVerify, onSave, saving }: Props) {
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
          <div className="flex items-center gap-2 shrink-0">
            {row.verifying ? <VerifyingBadge /> : <StatusBadge status={row.status} />}
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

        {row.quote && (
          <div className="rounded-md border-r-4 border-emerald-400 bg-emerald-50/50 px-3 py-2">
            <p className="text-xs text-emerald-700 font-medium mb-1">النص المقتبس</p>
            <p className="text-sm text-slate-700 leading-relaxed font-[var(--font-amiri)]">“{row.quote}”</p>
          </div>
        )}

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
                <MatchChip ok={false} label="الصفحة (تتطلب رفع المصدر)" muted />
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

        <div className="flex flex-wrap items-center gap-2 pt-1">
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
          {row.page && !row.result?.pageVerifiable && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              التحقق من رقم الصفحة يتطلب رفع ملف المصدر
            </span>
          )}
        </div>
      </CardContent>
    </Card>
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
