// ── Verify Engine: orchestration service ─────────────────────────────────────
// The "controller" that runs the two-stage hybrid verification:
//   Stage 1: deep scan the uploaded PDF for the quote + printed page number.
//   Stage 2: if not found in the file, query global libraries (Google Books +
//            Open Library) and return a ready-to-use APA citation.

import { extractPagesFromPdf, scanFileForQuote } from './pdf-extractor'
import { findInGlobalLibrary } from './library-fallback'
import type { VerifyResponse } from './models'

export async function runVerification(opts: {
  file: File
  author: string
  quote: string
  expectedPage: string
}): Promise<VerifyResponse> {
  const { file, author, quote, expectedPage } = opts

  if (!author.trim() || !quote.trim()) {
    return {
      status: 'ERROR',
      message: 'اسم العالم ونص الاقتباس مطلوبان.',
      page: null,
      alternative: null,
    }
  }

  // ── Stage 1: file deep scan ──
  let pages: { number: number; text: string }[] = []
  try {
    pages = await extractPagesFromPdf(file)
  } catch {
    return {
      status: 'ERROR',
      message: 'تعذّر استخراج النص من الملف. قد يكون ممسوحاً ضوئياً أو محمياً.',
      page: null,
      alternative: null,
    }
  }

  const scan = scanFileForQuote(pages, quote, expectedPage)
  if (scan.status) {
    return {
      status: scan.status,
      message: scan.message || '',
      page: scan.printedPage,
      alternative: null,
    }
  }

  // ── Stage 2: global library fallback ──
  const alternative = await findInGlobalLibrary(quote, author)
  if (alternative) {
    return {
      status: 'ALTERNATIVE_FOUND',
      message:
        'تعذّر العثور على الاقتباس في ملفك، لكن النظام عثر عليه في المكتبة العالمية مع التوثيق المعتمد 100%.',
      page: null,
      alternative,
    }
  }

  return {
    status: 'NOT_FOUND',
    message:
      'لم يُعثر على الاقتباس في الملف ولا في المكتبات العالمية. قد يكون المرجع وهمياً أو الاقتباس غير دقيق.',
    page: null,
    alternative: null,
  }
}
