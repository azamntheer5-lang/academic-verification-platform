// Generates a sample PDF with PRINTED page numbers in the margins so we can
// test VERIFIED_EXACT / VERIFIED_CORRECTED properly.
// Run: bun run scripts/gen-numbered-pdf.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync } from 'fs'

async function main() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const size = 11

  // Each entry: printed page number (shown in margin) + body text
  const pages = [
    {
      printed: 42,
      title: 'Chapter 1: Foundations of Machine Learning',
      body: 'Machine learning is a subfield of artificial intelligence that enables systems to learn patterns from data without being explicitly programmed. The fundamental premise is that algorithms can improve their performance through experience.',
    },
    {
      printed: 43,
      title: 'Chapter 1 (continued)',
      body: 'Supervised learning requires labeled training data, while unsupervised learning discovers hidden structures. Reinforcement learning agents optimize long-term rewards through trial and error interactions with their environment.',
    },
    {
      printed: 88,
      title: 'Chapter 3: Distributed Training',
      body: 'As neural networks grew larger, researchers developed distributed training techniques to parallelize computation across multiple GPUs. This breakthrough enabled training of models with billions of parameters on commodity hardware clusters.',
    },
    {
      printed: 89,
      title: 'Chapter 3 (continued)',
      body: 'The transformer architecture revolutionized natural language processing by introducing self-attention mechanisms. This innovation allowed models to capture long-range dependencies without recurrent connections.',
    },
  ]

  for (const p of pages) {
    const page = doc.addPage([595, 842]) // A4
    // Top margin: printed page number (right-aligned, like a real book)
    const pageStr = String(p.printed)
    const w = font.widthOfTextAtSize(pageStr, 10)
    page.drawText(pageStr, { x: 595 - 50 - w, y: 820, size: 10, font, color: rgb(0.3, 0.3, 0.3) })
    // Title
    page.drawText(p.title, { x: 50, y: 780, size: 14, font: fontBold, color: rgb(0, 0, 0) })
    // Body (wrapped)
    const words = p.body.split(' ')
    let line = ''
    let y = 740
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      if (font.widthOfTextAtSize(test, size) > 495) {
        page.drawText(line, { x: 50, y, size, font, color: rgb(0.1, 0.1, 0.1) })
        y -= 16
        line = w
      } else line = test
    }
    if (line) page.drawText(line, { x: 50, y, size, font, color: rgb(0.1, 0.1, 0.1) })
  }

  writeFileSync('scripts/numbered-source.pdf', await doc.save())
  console.log('Wrote scripts/numbered-source.pdf with', pages.length, 'pages (printed:', pages.map((p) => p.printed).join(', '), ')')
}
main().catch((e) => { console.error(e); process.exit(1) })
