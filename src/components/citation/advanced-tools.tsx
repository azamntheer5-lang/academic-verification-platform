'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Radar, Network, GraduationCap, Scale, Compass, Upload, Copy, Check, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { CitationRow, BiasReport, ReferenceGraph, GuidelineRules } from '@/lib/types'
import { NetworkGraph } from './network-graph'

interface Props {
  rows: CitationRow[]
}

type Tab = 'bias' | 'network' | 'guideline' | 'integrity'

export function AdvancedTools({ rows }: Props) {
  const [tab, setTab] = useState<Tab>('bias')
  const [bias, setBias] = useState<BiasReport | null>(null)
  const [biasLoading, setBiasLoading] = useState(false)
  const [graph, setGraph] = useState<ReferenceGraph | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [guideline, setGuideline] = useState<GuidelineRules | null>(null)
  const [guidelineLoading, setGuidelineLoading] = useState(false)
  const [formatted, setFormatted] = useState<Record<string, string>>({})
  const [integResults, setIntegResults] = useState<Record<string, { retracted: boolean; predatory: boolean; note: string }> | null>(null)
  const [integLoading, setIntegLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const runBias = async () => {
    setBiasLoading(true)
    try {
      const res = await fetch('/api/research/bias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          citations: rows.map((r) => ({ author: r.author, year: r.year, title: r.title, type: r.title ? 'book' : 'other' })),
        }),
      })
      const data = await res.json()
      if (data.ok) setBias(data.report)
      else toast.error(data.error)
    } catch {
      toast.error('خطأ في الاتصال.')
    } finally {
      setBiasLoading(false)
    }
  }

  const runNetwork = async () => {
    setGraphLoading(true)
    try {
      const res = await fetch('/api/research/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          citations: rows.map((r) => ({ author: r.author, year: r.year, title: r.title })),
        }),
      })
      const data = await res.json()
      if (data.ok) setGraph(data.graph)
      else toast.error(data.error)
    } catch {
      toast.error('خطأ في الاتصال.')
    } finally {
      setGraphLoading(false)
    }
  }

  const uploadGuideline = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setGuidelineLoading(true)
    try {
      const form = new FormData()
      form.append('file', f)
      form.append('name', f.name.replace(/\.(pdf|docx)$/i, ''))
      const res = await fetch('/api/research/guideline', { method: 'POST', body: form })
      const data = await res.json()
      if (data.ok) {
        setGuideline(data.rules)
        toast.success(`استُخرجت قواعد دليل ${data.rules.name}`)
      } else toast.error(data.error)
    } catch {
      toast.error('خطأ في الاتصال.')
    } finally {
      setGuidelineLoading(false)
    }
  }

  const formatOne = async (row: CitationRow) => {
    if (!guideline) return
    try {
      const res = await fetch('/api/research/guideline-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: guideline,
          reference: {
            author: row.author,
            year: row.year,
            title: row.title,
            page: row.page ?? null,
          },
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setFormatted((f) => ({ ...f, [row.id]: data.formatted }))
      } else toast.error(data.error)
    } catch {
      toast.error('خطأ في الاتصال.')
    }
  }

  const runIntegrity = async () => {
    setIntegLoading(true)
    setIntegResults({})
    const out: Record<string, { retracted: boolean; predatory: boolean; note: string }> = {}
    for (const r of rows) {
      try {
        const res = await fetch('/api/research/integrity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: r.title || '', author: r.author, publisher: r.result?.bestHit?.publisher }),
        })
        const data = await res.json()
        if (data.ok) {
          out[r.id] = {
            retracted: data.result.retracted,
            predatory: data.result.predatory,
            note: data.result.note,
          }
          setIntegResults({ ...out })
        }
      } catch {
        /* ignore */
      }
    }
    setIntegLoading(false)
    toast.success('اكتمل فحص النزاهة العلمية.')
  }

  const tabs: { id: Tab; label: string; icon: typeof Radar }[] = [
    { id: 'bias', label: 'مُحلّل التحيز', icon: Scale },
    { id: 'network', label: 'خريطة العلاقات', icon: Network },
    { id: 'integrity', label: 'رادار السحب والافتراس', icon: Radar },
    { id: 'guideline', label: 'مهندس صيغ الجامعة', icon: GraduationCap },
  ]

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-violet-600" />
          الأدوات المتقدمة للنظام البيئي الأكاديمي
        </CardTitle>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <Button
                key={t.id}
                size="sm"
                variant={tab === t.id ? 'default' : 'outline'}
                onClick={() => setTab(t.id)}
                className="gap-1.5"
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Button>
            )
          })}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {tab === 'bias' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">تحليل توازن المراجع: الحداثة، التركيز على مؤلف واحد، التنوع اللغوي وأنواع المصادر.</p>
              <Button size="sm" onClick={runBias} disabled={biasLoading || rows.length === 0} className="gap-1.5">
                {biasLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
                حلّل التحيز
              </Button>
            </div>
            {bias && <BiasDashboard report={bias} />}
          </div>
        )}

        {tab === 'network' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">خريطة تفاعلية تُظهر ترابط المراجع ويقترح علماء أساسيين لم تذكرهم.</p>
              <Button size="sm" onClick={runNetwork} disabled={graphLoading || rows.length === 0} className="gap-1.5">
                {graphLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
                ابنِ الخريطة
              </Button>
            </div>
            {graph && <NetworkGraph graph={graph} />}
          </div>
        )}

        {tab === 'integrity' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">يفحص كل مرجع: هل سُحب (Retracted)؟ هل المجلة مفترسة (Predatory)؟</p>
              <Button size="sm" onClick={runIntegrity} disabled={integLoading || rows.length === 0} className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50" variant="outline">
                {integLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                افحص النزاهة
              </Button>
            </div>
            {integResults && (
              <div className="space-y-2">
                {rows.map((r) => {
                  const res = integResults[r.id]
                  return (
                    <div key={r.id} className="rounded-md border border-slate-200 bg-white p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {r.author} · {r.year}
                        </p>
                        {!res ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                        ) : res.retracted ? (
                          <Badge className="bg-red-200 text-red-900 border-red-300">🚨 مسحوبة</Badge>
                        ) : res.predatory ? (
                          <Badge className="bg-orange-200 text-orange-900 border-orange-300">⚠️ مفترسة</Badge>
                        ) : (
                          <Badge className="bg-emerald-200 text-emerald-900 border-emerald-300">✓ سليمة</Badge>
                        )}
                      </div>
                      {res && <p className="text-xs text-slate-600 mt-1">{res.note}</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'guideline' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-slate-600">ارفع دليل تنسيق المراجع لجامعتك (PDF/Word)، ويعيد النظام تنسيق مراجعك ليتطابق 100%.</p>
              <label className="inline-flex">
                <Button size="sm" asChild className="gap-1.5 cursor-pointer" disabled={guidelineLoading}>
                  <span>
                    {guidelineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    ارفع دليل الجامعة
                  </span>
                </Button>
                <input type="file" accept=".pdf,.docx" className="hidden" onChange={uploadGuideline} />
              </label>
            </div>
            {guideline && (
              <div className="rounded-md border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                <p className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
                  <GraduationCap className="h-4 w-4" />
                  دليل {guideline.name}
                </p>
                <p className="text-xs text-indigo-800 leading-relaxed">{guideline.rulesText}</p>
                <Separator />
                <p className="text-xs font-medium text-slate-700">أعد تنسيق كل مرجع حسب القواعد:</p>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {rows.map((r) => (
                    <div key={r.id} className="rounded border border-slate-200 bg-white p-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs font-medium text-slate-800 truncate">{r.author} · {r.year}</p>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => formatOne(r)}>نسّق</Button>
                          {formatted[r.id] && (
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => copy(formatted[r.id], r.id)}>
                              {copied === r.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              {copied === r.id ? 'نُسخ' : 'نسخ'}
                            </Button>
                          )}
                        </div>
                      </div>
                      {formatted[r.id] && (
                        <p className="text-xs text-slate-700 bg-slate-50 rounded px-2 py-1 font-[var(--font-amiri)]">{formatted[r.id]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BiasDashboard({ report }: { report: BiasReport }) {
  const sevColor: Record<string, string> = {
    ok: 'bg-emerald-200 text-emerald-900 border-emerald-300',
    warning: 'bg-amber-200 text-amber-900 border-amber-300',
    critical: 'bg-red-200 text-red-900 border-red-300',
  }
  const sevLabel: Record<string, string> = { ok: '✓ جيد', warning: '⚠ تحذير', critical: '🚨 حرج' }
  return (
    <div className="space-y-3">
      <div className={`rounded-md border px-3 py-2 ${sevColor[report.overallSeverity]}`}>
        <p className="text-sm font-medium">{report.overallNote}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Section title="الحداثة" sev={report.recency.severity} note={report.recency.note} sevColor={sevColor} sevLabel={sevLabel}>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${report.recency.score}%` }} />
            </div>
            <span className="text-xs font-medium">{report.recency.score}/100</span>
          </div>
          <div className="flex gap-1 text-xs">
            {report.recency.buckets.map((b, i) => (
              <div key={i} className="flex-1 text-center">
                <div className="h-8 bg-slate-100 rounded flex items-end justify-center" style={{ opacity: b.count ? 1 : 0.3 }}>
                  <span className="text-[10px] font-bold">{b.count}</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5 truncate" title={b.range}>{b.range}</p>
              </div>
            ))}
          </div>
        </Section>
        <Section title="تركيز المؤلفين" sev={report.authorConcentration.severity} note={report.authorConcentration.note} sevColor={sevColor} sevLabel={sevLabel}>
          {report.authorConcentration.topAuthors.slice(0, 4).map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-xs mb-1">
              <span className="truncate flex-1">{a.author}</span>
              <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full ${a.pct >= 40 ? 'bg-red-500' : a.pct >= 25 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${a.pct}%` }} />
              </div>
              <span className="font-medium w-8 text-left">{a.pct}%</span>
            </div>
          ))}
        </Section>
        <Section title="تنوع المصادر" sev={report.sourceDiversity.severity} note={report.sourceDiversity.note} sevColor={sevColor} sevLabel={sevLabel}>
          <div className="flex flex-wrap gap-1.5">
            {report.sourceDiversity.types.map((t, i) => (
              <Badge key={i} variant="outline" className="text-xs">{t.type}: {t.count} ({t.pct}%)</Badge>
            ))}
          </div>
        </Section>
        <Section title="التنوع اللغوي" sev={report.languageDiversity.severity} note={report.languageDiversity.note} sevColor={sevColor} sevLabel={sevLabel}>
          <div className="flex gap-2 text-xs">
            <Badge className="bg-emerald-100 text-emerald-800">عربي: {report.languageDiversity.ar}</Badge>
            <Badge className="bg-sky-100 text-sky-800">أجنبي: {report.languageDiversity.en}</Badge>
            {report.languageDiversity.other > 0 && <Badge variant="outline">أخرى: {report.languageDiversity.other}</Badge>}
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, sev, note, sevColor, sevLabel, children }: {
  title: string
  sev: string
  note: string
  sevColor: Record<string, string>
  sevLabel: Record<string, string>
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <Badge className={`text-xs ${sevColor[sev]}`}>{sevLabel[sev]}</Badge>
      </div>
      {children}
      <p className="text-xs text-slate-600 mt-2 leading-relaxed">{note}</p>
    </div>
  )
}
