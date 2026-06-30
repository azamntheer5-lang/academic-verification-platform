import { createServer, IncomingMessage, ServerResponse } from 'http'
import { PDFParse } from 'pdf-parse'
import { createRequire } from 'module'
import mammoth from 'mammoth'

// Configure pdfjs worker to the on-disk worker file (avoids bundler issues
// when this service is imported from the Next.js dev server).
const require = createRequire(import.meta.url)
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs')
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')

const MAX_PAGES = 800
const MAX_CHARS_PER_PAGE = 12000

interface ExtractedPage {
  number: number
  text: string
}

async function extractPdf(data: Uint8Array): Promise<{ pages: ExtractedPage[]; total: number; text: string }> {
  const parser = new PDFParse({ data })
  try {
    const result = await parser.getText()
    const pages = (result.pages || []).slice(0, MAX_PAGES).map((p) => ({
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

async function extractDocx(buf: Buffer): Promise<{ pages: ExtractedPage[]; total: number; text: string }> {
  const result = await mammoth.extractRawText({ buffer: buf })
  const fullText = result?.value || ''
  let chunks: string[]
  if (fullText.includes('\f')) {
    chunks = fullText.split('\f')
  } else {
    chunks = fullText.split(/\n{3,}/)
  }
  const pages = chunks.map((t) => t.trim()).filter((t) => t.length > 0).map((t, i) => ({
    number: i + 1,
    text: t.slice(0, MAX_CHARS_PER_PAGE),
  }))
  if (pages.length === 0 && fullText.trim()) {
    pages.push({ number: 1, text: fullText.trim().slice(0, MAX_CHARS_PER_PAGE) })
  }
  return { pages, total: pages.length, text: fullText }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, obj: unknown) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(body)
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  const url = req.url || ''

  if (url === '/health') {
    sendJson(res, 200, { ok: true, service: 'doc-extract' })
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
    return
  }

  // Route: /extract  (raw body = file bytes; kind from ?kind= or X-Kind header)
  if (url.startsWith('/extract')) {
    try {
      const kindMatch = url.match(/[?&]kind=([^&]+)/)
      const kindHeader = req.headers['x-kind']
      const kind = kindMatch ? kindMatch[1] : typeof kindHeader === 'string' ? kindHeader : 'pdf'
      const buf = await readBody(req)
      let result
      if (kind === 'docx') {
        result = await extractDocx(buf)
      } else {
        result = await extractPdf(new Uint8Array(buf))
      }
      if (!result.pages.length) {
        sendJson(res, 400, { ok: false, error: 'no-text-extracted' })
        return
      }
      sendJson(res, 200, { ok: true, pages: result.pages, total: result.total })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'extract-error'
      sendJson(res, 500, { ok: false, error: msg })
    }
    return
  }

  sendJson(res, 404, { ok: false, error: 'not-found' })
})

const PORT = 3004
server.listen(PORT, () => {
  console.log(`╔════════════════════════════════════╗`)
  console.log(`║  DOC-EXTRACT · PDF + DOCX service  ║`)
  console.log(`║  port ${PORT}                        ║`)
  console.log(`╚════════════════════════════════════╝`)
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))
