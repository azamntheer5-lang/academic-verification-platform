import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logError } from '@/server/verify-engine/server-utils'

// DELETE /api/my-library/[id]
// Removes a single audit record from the user's library.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ ok: false, error: 'معرف السجل مطلوب.' }, { status: 400 })
    }
    // Cascade delete: removing the citation also removes its verification result
    // (the relation has onDelete: Cascade in the schema).
    const deleted = await db.researchCitation.deleteMany({ where: { id } })
    if (deleted.count === 0) {
      return NextResponse.json({ ok: false, error: 'السجل غير موجود.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, deleted: deleted.count })
  } catch (e) {
    logError('my-library:DELETE', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'delete-error' },
      { status: 500 },
    )
  }
}
