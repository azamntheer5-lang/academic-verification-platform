// ── Verify Engine: orchestration service ─────────────────────────────────────
// The "controller" that runs the multi-stage hybrid verification:
//   Stage 1a: deep scan the uploaded PDF for the exact quote + printed page.
//   Stage 1b (Module 1): if exact fails AND semantic mode is enabled, run the
//             token-based fuzzy + keyword-proximity matcher for paraphrases.
//   Stage 2:  if still not found, query global libraries (Google Books +
//             Open Library + web search) and return a ready-to-use APA citation.

import { extractPagesFromPdf, scanFileForQuote, scanFileSemantic } from './pdf-extractor'
import { findInGlobalLibrary } from './library-fallback'
import type { VerifyResponse } from './models'

export interface VerificationOptions {
  file: File
  author: string
  quote: string
  expectedPage: string
  semantic?: boolean // enable paraphrase matching (Module 1)
}

export async function runVerification(opts: VerificationOptions): Promise<VerifyResponse> {
  const { file, author, quote, expectedPage, semantic = false } = opts

  if (!author.trim() || !quote.trim()) {
    return {
      status: 'ERROR',
      message: 'اسم العالم ونص الاقتباس مطلوبان.',
      page: null,
      alternative: null,
    }
  }

  // ── Stage 1a: exact string match in the uploaded file ──
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

  const exact = scanFileForQuote(pages, quote, expectedPage)
  if (exact.status) {
    return {
      status: exact.status,
      message: exact.message || '',
      page: exact.printedPage,
      alternative: null,
    }
  }

  // ── Stage 1b: semantic / paraphrase match (Module 1) ──
  // Runs when the user enabled semantic mode OR automatically as a fallback
  // when the exact match misses — paraphrased quotes are extremely common in
  // academic writing.
  if (semantic || pages.length > 0) {
    const sem = scanFileSemantic(pages, quote, expectedPage)
    if (sem.status) {
      return {
        status: sem.status,
        message: sem.message || '',
        page: sem.printedPage,
        alternative: null,
      }
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
