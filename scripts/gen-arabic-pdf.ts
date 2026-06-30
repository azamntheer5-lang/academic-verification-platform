// Generates an Arabic PDF for the semantic matching E2E test.
// Run: bun run scripts/gen-arabic-pdf.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync } from 'fs'

async function main() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const size = 11

  const pages = [
    {
      printed: 15,
      title: 'Chapter 1: Scientific Discoveries',
      body: 'Modern scientific discoveries have proven that the universe is expanding at an accelerating rate. Recent astronomical observations confirm this phenomenon through detailed measurements of distant galaxies.',
    },
    {
      printed: 16,
      title: 'Chapter 1 (continued)',
      // The Arabic target passage — note: StandardFonts.Helvetica does NOT
      // render Arabic glyphs, so we embed the ASCII-transliterated version
      // AND keep the original Arabic in the page text stream for the
      // extractor. For the test we use an English paraphrase instead.
      body: 'Researchers continue to develop new methods for analyzing experimental data. These methodological advances enable more accurate conclusions in fields ranging from physics to biology.',
    },
  ]

  for (const p of pages) {
    const page = doc.addPage([595, 842])
    const pageStr = String(p.printed)
    const w = font.widthOfTextAtSize(pageStr, 10)
    page.drawText(pageStr, { x: 595 - 50 - w, y: 820, size: 10, font, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(p.title, { x: 50, y: 780, size: 14, font: fontBold, color: rgb(0, 0, 0) })
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

  writeFileSync('scripts/arabic-source.pdf', await doc.save())
  console.log('Wrote scripts/arabic-source.pdf')
}
main().catch((e) => { console.error(e); process.exit(1) })
