// One-click reference export to RIS and BibTeX formats.
// These are the standard interchange formats consumed by Zotero, EndNote,
// Mendeley, and JabRef. We escape special characters and pick the right
// entry type per source.

export interface ExportSource {
  type: string // book | journal | web | thesis | other
  title: string
  authors: string // newline or semicolon separated
  year: string
  publisher?: string | null
  city?: string | null
  edition?: string | null
  journal?: string | null
  volume?: string | null
  issue?: string | null
  pagesRange?: string | null
  url?: string | null
  doi?: string | null
  isbn?: string | null
  language?: string | null
  note?: string | null
}

function splitAuthors(raw: string): string[] {
  return raw.split(/[\n;]+/g).map((a) => a.trim()).filter(Boolean)
}

// BibTeX expects "Last, First" form per author, separated by " and "
function bibtexAuthors(raw: string): string {
  const authors = splitAuthors(raw)
  return authors
    .map((a) => {
      const n = a.trim()
      if (n.includes(',')) return n
      const parts = n.split(/\s+/)
      if (parts.length === 1) return parts[0]
      return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
    })
    .join(' and ')
}

// RIS expects "Last, First|" per AU line (one per line)
function risAuthorLines(raw: string): string[] {
  return splitAuthors(raw).map((a) => {
    const n = a.trim()
    if (n.includes(',')) return n
    const parts = n.split(/\s+/)
    if (parts.length === 1) return parts[0]
    return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
  })
}

function bibtexEscape(s: string): string {
  return (s || '').replace(/([&%$#_{}~^\\])/g, '\\$1')
}

function citeKey(s: ExportSource): string {
  const first = splitAuthors(s.authors)[0] || 'ref'
  const last = first.includes(',') ? first.split(',')[0] : first.split(/\s+/).slice(-1)[0]
  const key = (last || 'ref').toLowerCase().replace(/[^a-z0-9]/g, '')
  const year = (s.year || 'nd').replace(/[^0-9a-z]/gi, '').slice(0, 4) || 'nd'
  const t = (s.title || '').split(/\s+/).slice(0, 2).join('').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
  return `${key}${year}${t}`.replace(/,+$/, '')
}

function entryType(type: string): string {
  switch (type) {
    case 'journal': return 'article'
    case 'web': return 'misc'
    case 'thesis': return 'phdthesis'
    default: return 'book'
  }
}

function risType(type: string): string {
  switch (type) {
    case 'journal': return 'JOUR'
    case 'web': return 'ELEC'
    case 'thesis': return 'THES'
    default: return 'BOOK'
  }
}

export function toBibTeX(s: ExportSource): string {
  const type = entryType(s.type)
  const key = citeKey(s)
  const lines: string[] = []
  lines.push(`@${type}{${key},`)
  lines.push(`  title = {${bibtexEscape(s.title)}}`)
  const authors = bibtexAuthors(s.authors)
  if (authors) lines.push(`  author = {${bibtexEscape(authors)}}`)
  if (s.year) lines.push(`  year = {${bibtexEscape(s.year)}}`)
  if (s.publisher) lines.push(`  publisher = {${bibtexEscape(s.publisher)}}`)
  if (s.city) lines.push(`  address = {${bibtexEscape(s.city)}}`)
  if (s.edition) lines.push(`  edition = {${bibtexEscape(s.edition)}}`)
  if (s.journal) lines.push(`  journal = {${bibtexEscape(s.journal)}}`)
  if (s.volume) lines.push(`  volume = {${bibtexEscape(s.volume)}}`)
  if (s.issue) lines.push(`  number = {${bibtexEscape(s.issue)}}`)
  if (s.pagesRange) lines.push(`  pages = {${bibtexEscape(s.pagesRange)}}`)
  if (s.url) lines.push(`  url = {${bibtexEscape(s.url)}}`)
  if (s.doi) lines.push(`  doi = {${bibtexEscape(s.doi)}}`)
  if (s.isbn) lines.push(`  isbn = {${bibtexEscape(s.isbn)}}`)
  if (s.language) lines.push(`  language = {${bibtexEscape(s.language)}}`)
  if (s.note) lines.push(`  note = {${bibtexEscape(s.note)}}`)
  return lines.join(',\n') + '\n}'
}

export function toRIS(s: ExportSource): string {
  const lines: string[] = []
  lines.push(`TY  - ${risType(s.type)}`)
  for (const a of risAuthorLines(s.authors)) {
    lines.push(`AU  - ${a}`)
  }
  if (s.year) lines.push(`PY  - ${s.year}`)
  lines.push(`TI  - ${s.title}`)
  if (s.journal) lines.push(`JO  - ${s.journal}`)
  if (s.volume) lines.push(`VL  - ${s.volume}`)
  if (s.issue) lines.push(`IS  - ${s.issue}`)
  if (s.pagesRange) lines.push(`SP  - ${s.pagesRange}`)
  if (s.publisher) lines.push(`PB  - ${s.publisher}`)
  if (s.city) lines.push(`CY  - ${s.city}`)
  if (s.edition) lines.push(`ET  - ${s.edition}`)
  if (s.isbn) lines.push(`SN  - ${s.isbn}`)
  if (s.url) lines.push(`UR  - ${s.url}`)
  if (s.doi) lines.push(`DO  - ${s.doi}`)
  if (s.language) lines.push(`LA  - ${s.language}`)
  if (s.note) lines.push(`N1  - ${s.note}`)
  lines.push('ER  - ')
  return lines.join('\n')
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
