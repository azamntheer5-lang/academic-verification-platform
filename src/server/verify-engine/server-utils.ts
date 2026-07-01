// ── Server-side utilities: logging, input validation, rate limiting ──────────
// Centralized helpers so every API route validates inputs consistently and
// logs errors to the server console (essential for production observability).

import { NextRequest, NextResponse } from 'next/server'

// ── File extraction (shared) ─────────────────────────────────────────────────
// Tries the doc-extract mini-service first (local dev, port 3004), then falls
// back to direct extraction using unpdf (PDF) or mammoth (DOCX) for Vercel.

export interface ExtractedPage {
  number: number
  text: string
}

export async function extractFilePages(file: File, kind: 'pdf' | 'docx'): Promise<ExtractedPage[]> {
  // Strategy 1: mini-service (local dev)
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const res = await fetch('http://localhost:3004/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Kind': kind },
      body: bytes,
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; pages?: ExtractedPage[] }
      if (data.ok && data.pages && data.pages.length > 0) return data.pages
    }
  } catch {
    // mini-service not available — fall through
  }

  // Strategy 2: direct extraction (Vercel)
  if (kind === 'pdf') {
    return extractPdfWithUnpdf(file)
  }
  return extractDocxWithMammoth(file)
}

async function extractPdfWithUnpdf(file: File): Promise<ExtractedPage[]> {
  const { getDocumentProxy } = await import('unpdf')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocumentProxy(bytes)
  const pages: ExtractedPage[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item: { str?: string; hasEOL?: boolean }) =>
        item.hasEOL ? (item.str || '') + '\n' : item.str || '',
      )
      .join(' ')
      .replace(/ \n/g, '\n')
      .slice(0, 12000)
    pages.push({ number: i, text })
  }
  return pages
}

async function extractDocxWithMammoth(file: File): Promise<ExtractedPage[]> {
  const mammoth = (await import('mammoth')).default
  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await mammoth.extractRawText({ buffer })
  const fullText = result?.value || ''
  // Split on form-feed or multiple newlines for pseudo-pages
  const chunks = fullText.includes('\f')
    ? fullText.split('\f')
    : fullText.split(/\n{3,}/)
  const pages = chunks
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t, i) => ({ number: i + 1, text: t.slice(0, 12000) }))
  if (pages.length === 0 && fullText.trim()) {
    pages.push({ number: 1, text: fullText.trim().slice(0, 12000) })
  }
  return pages
}

// ── Logging ──────────────────────────────────────────────────────────────────
// Wrap every silent catch with this so errors surface in the server log
// instead of vanishing. In production these go to stderr/stdout which the
// hosting platform (Vercel/Railway) captures.
export function logError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : ''
  console.error(`[ERROR] ${context}: ${msg}`, stack || '')
}

export function logInfo(context: string, msg: string): void {
  console.log(`[INFO] ${context}: ${msg}`)
}

// ── Input validation ─────────────────────────────────────────────────────────
export const MAX_PDF_SIZE = 10 * 1024 * 1024 // 10 MB
export const MAX_DOCX_SIZE = 10 * 1024 * 1024 // 10 MB
export const MAX_QUOTE_LENGTH = 5000 // single quote — prevents DoS via huge strings
export const MAX_AUTHOR_LENGTH = 200
export const MAX_BIBLIOGRAPHY_LENGTH = 20000

export interface ValidationError {
  error: string
}

export function validateFile(file: File | null | undefined, allowed: string[] = ['.pdf', '.docx']): { ok: true; file: File } | { ok: false; error: string } {
  if (!file || !(file instanceof File)) {
    return { ok: false, error: 'لم يتم استلام ملف.' }
  }
  const lower = file.name.toLowerCase()
  const ext = allowed.find((e) => lower.endsWith(e))
  if (!ext) {
    return { ok: false, error: `صيغة الملف غير مدعومة. المسموح: ${allowed.join(', ')}` }
  }
  const sizeLimit = ext === '.pdf' ? MAX_PDF_SIZE : MAX_DOCX_SIZE
  if (file.size > sizeLimit) {
    return { ok: false, error: `حجم الملف ${Math.round(file.size / 1024 / 1024)}MB يتجاوز الحد المسموح (${Math.round(sizeLimit / 1024 / 1024)}MB).` }
  }
  if (file.size === 0) {
    return { ok: false, error: 'الملف فارغ.' }
  }
  return { ok: true, file }
}

export function validateText(value: string, fieldName: string, max: number, required = true): { ok: true; value: string } | { ok: false; error: string } {
  const v = (value || '').trim()
  if (required && !v) {
    return { ok: false, error: `${fieldName} مطلوب.` }
  }
  if (v.length > max) {
    return { ok: false, error: `${fieldName} طويل جداً (الحد ${max} حرف).` }
  }
  return { ok: true, value: v }
}

// ── Rate limiting (in-memory, per-IP) ────────────────────────────────────────
// Simple sliding-window limiter. For multi-instance production you'd swap
// this for @upstash/ratelimit (Redis-backed), but in-memory is correct for
// single-instance / serverless-warm instances.
interface RateBucket {
  count: number
  resetAt: number
}

const rateBuckets = new Map<string, RateBucket>()
const RATE_WINDOW_MS = 60_000 // 1 minute
const RATE_MAX_REQUESTS = 10 // per IP per window

export function rateLimit(req: NextRequest, max: number = RATE_MAX_REQUESTS): boolean {
  // Allow localhost / internal calls without limit (mini-service calls)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return true

  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  bucket.count++
  return bucket.count <= max
}

export function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: 'تجاوزت الحد المسموح من الطلبات (10/دقيقة). انتظر قليلاً ثم أعد المحاولة.' },
    { status: 429, headers: { 'Retry-After': '60' } },
  )
}
