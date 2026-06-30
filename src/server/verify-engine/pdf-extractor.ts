// ── Verify Engine: PDF deep scan ─────────────────────────────────────────────
// Calls the doc-extract mini-service (port 3004) to get per-page text, then
// runs the same logic as the Python reference: detect printed page numbers
// from top/bottom margins and locate the verbatim quote.

interface ExtractedPage {
  number: number
  text: string
}

export interface FileScanResult {
  status: 'VERIFIED_EXACT' | 'VERIFIED_CORRECTED' | null
  printedPage: string | null
  message: string | null
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[«»"“”‘’`(){}\[\],;:!?؟.,\-–—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Read the top/bottom margin of a page and detect a standalone page number
// (excluding years like 2016).
function extractPrintedPage(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  const margins = [lines[0], lines[lines.length - 1], lines[1] || '', lines[lines.length - 2] || '']
  for (const line of margins) {
    if (!line) continue
    const pure = line.replace(/[-–—|.()\s]/g, '')
    if (/^\d{1,4}$/.test(pure)) {
      const n = parseInt(pure, 10)
      if (n >= 1 && n <= 9999 && !/^(19|20)\d{2}$/.test(pure)) {
        return pure
      }
    }
  }
  return null
}

export async function extractPagesFromPdf(file: File): Promise<ExtractedPage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const res = await fetch('http://localhost:3004/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Kind': 'pdf' },
    body: bytes,
  })
  if (!res.ok) throw new Error('تعذّر استخراج نص الملف من الخدمة.')
  const data = (await res.json()) as { ok: boolean; pages?: ExtractedPage[] }
  return data.pages || []
}

export function scanFileForQuote(
  pages: ExtractedPage[],
  quote: string,
  expectedPage: string,
): FileScanResult {
  const qNorm = normalize(quote)
  if (!qNorm) return { status: null, printedPage: null, message: null }

  for (const page of pages) {
    const textNorm = normalize(page.text)
    if (textNorm.includes(qNorm)) {
      const printed = extractPrintedPage(page.text)
      if (expectedPage && printed && printed !== expectedPage) {
        return {
          status: 'VERIFIED_CORRECTED',
          printedPage: printed,
          message: `الاقتباس موجود فعلاً لكن في الصفحة المطبوعة ${printed} لا ${expectedPage}. تم التصحيح تلقائياً.`,
        }
      }
      const finalPage = printed || String(page.number)
      return {
        status: 'VERIFIED_EXACT',
        printedPage: finalPage,
        message: 'الاقتباس موجود حرفياً في الملف — التوثيق صحيح 100%.',
      }
    }
  }
  return { status: null, printedPage: null, message: null }
}
