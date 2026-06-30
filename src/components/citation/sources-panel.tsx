'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Library, Trash2, ExternalLink, BookMarked, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { SavedSource } from '@/lib/types'

const TYPE_LABELS: Record<string, string> = {
  book: 'كتاب',
  journal: 'مقالة مجلة',
  web: 'مصدر ويب',
  thesis: 'رسالة',
  other: 'أخرى',
}

export function SourcesPanel() {
  const [sources, setSources] = useState<SavedSource[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sources')
      const data = await res.json()
      if (data.ok) setSources(data.sources)
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
    return () => window.removeEventListener('sources-changed', onChanged)
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

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BookMarked className="h-5 w-5 text-emerald-600" />
          مكتبتي
          <Badge variant="secondary" className="mr-auto">{sources.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            تحميل…
          </div>
        ) : sources.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Library className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد مصادر محفوظة بعد.</p>
            <p className="text-xs mt-1">حقّق في توثيق ثم احفظه ليظهر هنا.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[28rem] w-full">
            <div className="space-y-2 pr-1">
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
                          {TYPE_LABELS[s.type] || s.type}
                        </Badge>
                        {s.publisher && (
                          <Badge variant="outline" className="text-xs font-normal">{s.publisher}</Badge>
                        )}
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
