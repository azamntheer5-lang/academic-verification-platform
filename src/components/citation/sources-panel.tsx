'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Library, Trash2, ExternalLink, BookMarked, Loader2, ShieldCheck, ShieldAlert, Download } from 'lucide-react'
import { toast } from 'sonner'
import type { SavedSource } from '@/lib/types'

interface AuditItem {
  id: string
  author: string
  quote: string
  status: string
  verifiedAuthor: string | null
  verifiedTitle: string | null
  verifiedYear: string | null
  verifiedPage: string | null
  verifiedPublisher: string | null
  fullApa: string | null
  createdAt: string
  foundInFile: boolean
  foundInLibrary: boolean
  isHallucination: boolean
}

const STATUS_LABELS: Record<string, string> = {
  VERIFIED_EXACT: 'موثّق حرفياً',
  VERIFIED_CORRECTED: 'موثّق مع تصحيح',
  VERIFIED_SEMANTIC: 'موثّق دلالياً',
  ALTERNATIVE_FOUND: 'بديل عالمي',
  NOT_FOUND: 'غير موجود',
  HALLUCINATION: 'هلوسة',
  PENDING: 'قيد الانتظار',
}

export function SourcesPanel() {
  const [sources, setSources] = useState<SavedSource[]>([])
  const [audits, setAudits] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      // Fetch both: manual saved sources + persisted audit history
      const [sourcesRes, auditsRes] = await Promise.all([
        fetch('/api/sources').then((r) => r.json()).catch(() => ({ ok: false })),
        fetch('/api/my-library').then((r) => r.json()).catch(() => ({ ok: false })),
      ])
      if (sourcesRes.ok) setSources(sourcesRes.sources || [])
      if (auditsRes.ok) setAudits(auditsRes.citations || [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const onChanged = () => load()
    window.addEventListener('sources-changed', onChanged)
    window.addEventListener('audits-changed', onChanged)
    return () => {
      window.removeEventListener('sources-changed', onChanged)
      window.removeEventListener('audits-changed', onChanged)
    }
  }, [])

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setSources((s) => s.filter((x) => x.id !== id))
        toast.success('حُذف المصدر.')
      } else {
        toast.error('تعذّر الحذف.')
      }
    } catch {
      toast.error('خطأ في الاتصال.')
    }
  }

  const removeAudit = async (id: string) => {
    try {
      const res = await fetch(`/api/my-library/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setAudits((a) => a.filter((x) => x.id !== id))
        toast.success('حُذف السجل.')
      } else {
        toast.error(data.error || 'تعذّر الحذف.')
      }
    } catch {
      toast.error('خطأ في الاتصال.')
    }
  }

  const exportLibrary = (format: 'bibtex' | 'ris') => {
    window.open(`/api/my-library/export?format=${format}`, '_blank')
    toast.success(`تصدير ${format === 'ris' ? 'RIS' : 'BibTeX'} — استورده في Zotero/EndNote/Mendeley.`)
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BookMarked className="h-5 w-5 text-emerald-600" />
          مكتبتي
          <Badge variant="secondary" className="mr-auto">
            {sources.length + audits.length}
          </Badge>
          {(sources.length > 0 || audits.length > 0) && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 gap-1"
                onClick={() => exportLibrary('bibtex')}
                title="تصدير كل المراجع بصيغة BibTeX"
              >
                <Download className="h-3 w-3" /> BibTeX
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 gap-1"
                onClick={() => exportLibrary('ris')}
                title="تصدير كل المراجع بصيغة RIS"
              >
                <Download className="h-3 w-3" /> RIS
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            تحميل…
          </div>
        ) : sources.length === 0 && audits.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Library className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد سجلات بعد.</p>
            <p className="text-xs mt-1">حقّق في توثيق أو طهّر قائمة مراجع ليُحفظ تلقائياً.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[32rem] w-full">
            <div className="space-y-2 pr-1">
              {/* Persisted audit history (from verify-engine + clean-bibliography) */}
              {audits.map((a) => (
                <div
                  key={a.id}
                  className="rounded-md border border-slate-200 bg-white p-3 hover:border-emerald-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 truncate" title={a.verifiedTitle || a.author}>
                        {a.verifiedTitle || a.author || 'مرجع'}
                      </p>
                      <p className="text-sm text-slate-600 truncate">
                        {a.verifiedAuthor || a.author} · {a.verifiedYear || 'بلا تاريخ'}
                        {a.verifiedPage ? ` · ص ${a.verifiedPage}` : ''}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <Badge
                          className={`text-xs gap-1 ${
                            a.isHallucination || a.status === 'NOT_FOUND' || a.status === 'HALLUCINATION'
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {a.isHallucination || a.status === 'NOT_FOUND' || a.status === 'HALLUCINATION' ? (
                            <><ShieldAlert className="h-3 w-3" /> {STATUS_LABELS[a.status] || a.status}</>
                          ) : (
                            <><ShieldCheck className="h-3 w-3" /> {STATUS_LABELS[a.status] || a.status}</>
                          )}
                        </Badge>
                        {a.verifiedPublisher && (
                          <Badge variant="outline" className="text-xs font-normal truncate max-w-[120px]">
                            {a.verifiedPublisher}
                          </Badge>
                        )}
                      </div>
                      {a.fullApa && (
                        <p className="text-xs text-slate-500 mt-1 font-mono truncate" dir="ltr" title={a.fullApa}>
                          {a.fullApa}
                        </p>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-red-600 shrink-0"
                      onClick={() => removeAudit(a.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Manual saved sources */}
              {sources.map((s) => (
                <div
                  key={s.id}
                  className="rounded-md border border-slate-200 bg-white p-3 hover:border-emerald-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 truncate" title={s.title}>
                        {s.title}
                      </p>
                      <p className="text-sm text-slate-600 truncate">
                        {s.authors} · {s.year}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <Badge variant="secondary" className="text-xs">
                          محفوظ يدوياً
                        </Badge>
                        {s.url && (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex"
                          >
                            <Badge variant="outline" className="text-xs gap-1 hover:bg-slate-50">
                              <ExternalLink className="h-3 w-3" /> رابط
                            </Badge>
                          </a>
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-red-600 shrink-0"
                      onClick={() => remove(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
