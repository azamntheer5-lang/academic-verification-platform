// Generates a sample academic-book PDF to test the page-verification flow.
// Run: bun run scripts/gen-sample-pdf.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync } from 'fs'

async function main() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const size = 11
  const lineHeight = 16

  const paragraphs = [
    { page: 1, title: 'Chapter 1: Introduction to Deep Learning', body: 'Deep learning is a branch of artificial intelligence that has made remarkable progress in recent years. Neural networks are able to represent complex functions with high precision.' },
    { page: 2, title: 'Chapter 2: Distributed Processing', body: 'Distributed processing greatly improves the efficiency of training large neural networks. As Pearson (2019) noted, gradient descent reduces the risk of overfitting when applied with proper regularization.' },
    { page: 44, title: 'Chapter 3: Representation of Complex Functions', body: 'As Lochte (2016) pointed out, artificial neural networks are capable of representing complex functions with high accuracy. This capability forms the foundation of modern deep learning systems.' },
    { page: 45, title: 'Chapter 3 (continued)', body: 'The capacity of neural networks to approximate any continuous function was proven theoretically. Lochte (2016) emphasized that this universal approximation property holds even for networks with a single hidden layer, given sufficient width.' },
    { page: 112, title: 'Chapter 7: Big Data Infrastructure', body: 'Big data requires flexible infrastructure. Johnson (2018) argued that scalable systems must handle volume, velocity, and variety simultaneously. The book titled Fundamentals of Big Data explores these dimensions in depth.' },
    { page: 113, title: 'Chapter 7 (continued)', body: 'According to Pearson (2019), distributed processing improves training efficiency significantly. The architecture must balance computational load across multiple nodes to achieve optimal performance.' },
  ]

  for (const p of paragraphs) {
    const page = doc.addPage([595, 842])
    page.drawText(p.title, { x: 50, y: 780, size: 14, font: fontBold, color: rgb(0, 0, 0) })
    const words = p.body.split(' ')
    let line = ''
    let y = 740
    const maxWidth = 495
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      const width = font.widthOfTextAtSize(test, size)
      if (width > maxWidth) {
        page.drawText(line, { x: 50, y, size, font, color: rgb(0.1, 0.1, 0.1) })
        y -= lineHeight
        line = w
      } else {
        line = test
      }
    }
    if (line) {
      page.drawText(line, { x: 50, y, size, font, color: rgb(0.1, 0.1, 0.1) })
    }
  }

  const bytes = await doc.save()
  writeFileSync('scripts/sample-source.pdf', bytes)
  console.log('Wrote scripts/sample-source.pdf with', paragraphs.length, 'pages')
}

main().catch(e => { console.error(e); process.exit(1) })
