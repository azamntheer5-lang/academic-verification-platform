'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Sparkles, BookOpen, Link2 } from 'lucide-react'
import type { ReferenceGraph, GraphNode } from '@/lib/types'

interface Props {
  graph: ReferenceGraph
}

// Deterministic circular layout for the nodes. For a small number of nodes
// (typical citation list) this reads cleanly without needing a physics engine.
export function NetworkGraph({ graph }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  const positions = useMemo(() => {
    const n = graph.nodes.length
    const cx = 200, cy = 180, r = 130
    const map = new Map<string, { x: number; y: number }>()
    graph.nodes.forEach((node, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2
      map.set(node.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    })
    return map
  }, [graph.nodes])

  const maxWeight = Math.max(...graph.nodes.map((n) => n.weight), 1)
  const citedCount = graph.nodes.filter((n) => n.type === 'cited').length
  const sugCount = graph.nodes.filter((n) => n.type === 'suggested').length
  const citesEdges = graph.edges.filter((e) => e.relation === 'cites').length
  const coEdges = graph.edges.filter((e) => e.relation === 'co_cite').length

  return (
    <div className="space-y-3">
      {/* legend + stats */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge className="bg-emerald-100 text-emerald-800 gap-1"><BookOpen className="h-3 w-3" /> {citedCount} مُقتبَس</Badge>
        <Badge className="bg-violet-100 text-violet-800 gap-1"><Sparkles className="h-3 w-3" /> {sugCount} مقترح</Badge>
        <Badge variant="outline" className="gap-1"><Link2 className="h-3 w-3" /> {citesEdges} استشهاد مباشر</Badge>
        <Badge variant="outline">{coEdges} رابطة مشاركة</Badge>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
        <svg viewBox="0 0 400 360" className="w-full h-auto" style={{ maxHeight: 380 }}>
          {/* edges */}
          {graph.edges.map((e, i) => {
            const s = positions.get(e.source)
            const t = positions.get(e.target)
            if (!s || !t) return null
            const isCites = e.relation === 'cites'
            const isHovered = hovered === e.source || hovered === e.target
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={isCites ? '#7c3aed' : '#94a3b8'}
                strokeWidth={isCites ? 2 : 1}
                strokeDasharray={isCites ? '0' : '4 3'}
                opacity={isHovered ? 0.9 : 0.4}
              />
            )
          })}

          {/* nodes */}
          {graph.nodes.map((node) => {
            const p = positions.get(node.id)
            if (!p) return null
            const isCited = node.type === 'cited'
            const radius = isCited ? 14 + (node.weight / maxWeight) * 12 : 12
            const isHovered = hovered === node.id
            return (
              <g
                key={node.id}
                transform={`translate(${p.x}, ${p.y})`}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  r={radius}
                  fill={isCited ? '#10b981' : '#8b5cf6'}
                  stroke={isHovered ? '#1e293b' : '#fff'}
                  strokeWidth={isHovered ? 3 : 2}
                  opacity={0.9}
                />
                <text
                  y={radius + 12}
                  textAnchor="middle"
                  className="text-[10px] font-medium"
                  fill="#1e293b"
                >
                  {node.label}
                </text>
                {node.weight > 1 && (
                  <text textAnchor="middle" dy="0.35em" className="text-[10px] font-bold" fill="#fff">
                    {node.weight}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* suggestions list */}
      {graph.suggestions.length > 0 && (
        <div className="rounded-md border-2 border-violet-300 bg-violet-50/50 p-3">
          <p className="text-sm font-bold text-violet-900 flex items-center gap-1.5 mb-2">
            <Sparkles className="h-4 w-4" />
            علماء أساسيون مقترحون لم تذكرهم
          </p>
          <div className="space-y-2">
            {graph.suggestions.map((s, i) => (
              <div key={i} className="rounded bg-white border border-violet-200 px-2 py-1.5">
                <p className="text-sm font-medium text-slate-900">{s.author}</p>
                <p className="text-xs text-slate-600">{s.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 leading-relaxed">
        💡 العُقد الخضراء = علماء اقتبست منهم (حجمها يتناسب مع عدد الاقتباسات). العُقد البنفسجية = علماء مقترحون.
        الخطوط البنفسجية الصلبة = استشهاد مباشر (A ي cites B). الخطوط الرمادية المتقطعة = رابطة مشاركة في الاقتباس.
      </p>
    </div>
  )
}
