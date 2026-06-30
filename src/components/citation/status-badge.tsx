'use client'

import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Loader2 } from 'lucide-react'
import type { VerifyStatus } from '@/lib/types'

const MAP: Record<VerifyStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  verified: { label: 'موثَّق', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle2 },
  author_mismatch: { label: 'خطأ في المؤلف', cls: 'bg-red-100 text-red-800 border-red-300', icon: XCircle },
  not_found: { label: 'غير موجود', cls: 'bg-rose-100 text-rose-800 border-rose-300', icon: XCircle },
  partial: { label: 'تطابق جزئي', cls: 'bg-amber-100 text-amber-800 border-amber-300', icon: AlertTriangle },
  error: { label: 'خطأ', cls: 'bg-slate-200 text-slate-700 border-slate-300', icon: AlertTriangle },
  pending: { label: 'بانتظار التحقق', cls: 'bg-slate-100 text-slate-600 border-slate-300', icon: HelpCircle },
}

export function StatusBadge({ status }: { status: VerifyStatus }) {
  const m = MAP[status] || MAP.pending
  const Icon = m.icon
  return (
    <Badge variant="outline" className={`${m.cls} gap-1 font-medium`}>
      <Icon className="h-3.5 w-3.5" />
      {m.label}
    </Badge>
  )
}

export function VerifyingBadge() {
  return (
    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      جارٍ البحث في المكتبات…
    </Badge>
  )
}
