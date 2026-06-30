// PDF text extraction wrapper around pdf-parse v2.
// pdf-parse exposes a PDFParse class whose getText() returns per-page text,
// which is exactly what we need to verify a quote against a claimed page.

import { PDFParse } from 'pdf-parse'

export interface ExtractedPage {
  number: number // 1-based as reported by the PDF
  text: string
}

export interface PdfExtractResult {
  pages: ExtractedPage[]
  total: number
  text: string
}

const MAX_PAGES = 800 // hard cap to protect memory / DB
const MAX_CHARS_PER_PAGE = 12000

export async function extractPdfPages(data: Uint8Array): Promise<PdfExtractResult> {
  const parser = new PDFParse({ data })
  try {
    const result = await parser.getText()
    const pages: ExtractedPage[] = (result.pages || [])
      .slice(0, MAX_PAGES)
      .map((p) => ({
        number: p.num,
        text: (p.text || '').slice(0, MAX_CHARS_PER_PAGE),
      }))
    return {
      pages,
      total: result.total || pages.length,
      text: result.text || pages.map((p) => p.text).join('\n'),
    }
  } finally {
    await parser.destroy().catch(() => {})
  }
}
