// Citation formatting helpers (APA 7, MLA 9, Chicago, Harvard).
// These are pure formatting utilities shared by the server (export) and the
// client (live preview). They are intentionally tolerant of partial metadata.

export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'harvard'

export interface SourceFields {
  type: string // book | journal | web | thesis | other
  title: string
  authors: string // newline or semicolon separated, "Last, First" preferred
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
  language?: string | null
}

export interface CitationOutput {
  style: CitationStyle
  label: string
  full: string // bibliography / works-cited entry
  inText: string // in-text citation
}

// ── author parsing ────────────────────────────────────────────────────────────
function splitAuthors(raw: string): string[] {
  return raw
    .split(/[\n;]+/g)
    .map((a) => a.trim())
    .filter(Boolean)
}

// "Smith, John Arthur" -> "Smith, J. A." (APA / Harvard initials style)
function toInitials(name: string): string {
  const n = name.trim()
  if (!n) return ''
  // If already "Last, First" form, initials come from the part after the comma
  if (n.includes(',')) {
    const [last, rest] = n.split(',', 2).map((s) => s.trim())
    const initials = rest
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + '.')
      .join(' ')
    return `${last}, ${initials}`.trim()
  }
  // "John Arthur Smith" -> "J. A. Smith"
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  const firsts = parts.slice(0, -1)
  const last = parts[parts.length - 1]
  const initials = firsts.map((w) => w.charAt(0).toUpperCase() + '.').join(' ')
  return `${initials} ${last}`.trim()
}

// MLA keeps full author names, "Last, First"
function mlaName(name: string): string {
  const n = name.trim()
  if (!n) return ''
  if (n.includes(',')) return n
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
}

function joinAuthorsAPA(authors: string[]): string {
  if (authors.length === 0) return ''
  if (authors.length === 1) return authors[0]
  if (authors.length === 2) return `${authors[0]} و ${authors[1]}`
  if (authors.length <= 3) return `${authors.slice(0, -1).join('، ')}، و ${authors[authors.length - 1]}`
  return `${authors[0]} وآخرون`
}

function joinAuthorsMLA(authors: string[]): string {
  if (authors.length === 0) return ''
  if (authors.length === 1) return authors[0]
  if (authors.length === 2) return `${authors[0]}، و ${authors[1]}`
  // 3+ in MLA: first author et al.
  return `${authors[0]} وآخرون`
}

function authorShortForInText(authors: string[]): string {
  if (authors.length === 0) return ''
  const first = authors[0]
  // take last name: if "Last, First" -> "Last"; else last token
  const last = first.includes(',') ? first.split(',')[0].trim() : first.trim().split(/\s+/).slice(-1)[0]
  if (authors.length === 1) return last
  if (authors.length === 2) {
    const second = authors[1].includes(',')
      ? authors[1].split(',')[0].trim()
      : authors[1].trim().split(/\s+/).slice(-1)[0]
    return `${last} و ${second}`
  }
  return `${last} وآخرون`
}

// ── per-style formatters ──────────────────────────────────────────────────────
function formatAPA(s: SourceFields, page?: number | null): CitationOutput {
  const authors = splitAuthors(s.authors).map(toInitials)
  const authorStr = joinAuthorsAPA(authors) || 'بدون مؤلف'
  const year = s.year || 'بلا تاريخ'
  const edition = s.edition ? ` (الطبعة ${s.edition})` : ''
  let full = ''
  switch (s.type) {
    case 'journal':
      full = `${authorStr} (${year}). ${s.title}. *${s.journal || 'مجلة'}*`
      if (s.volume) full += `، ${s.volume}`
      if (s.issue) full += `(${s.issue})`
      if (s.pagesRange) full += `، ${s.pagesRange}`
      full += '.'
      break
    case 'web':
      full = `${authorStr} (${year}). ${s.title}. ${s.siteName || 'موقع إلكتروني'}.`
      if (s.url) full += ` ${s.url}`
      break
    case 'thesis':
      full = `${authorStr} (${year}). *${s.title}* [رسالة ماجستير، غير منشورة]. ${s.publisher || ''}.`
      break
    default: // book
      full = `${authorStr} (${year}). *${s.title}*${edition}. ${s.publisher || ''}.`.trim()
      if (full.endsWith('.')) full = full
      else full += '.'
  }
  const short = authorShortForInText(splitAuthors(s.authors))
  const inText = `(${short}، ${year}${page ? `، ص. ${page}` : ''})`
  return { style: 'apa', label: 'APA', full, inText }
}

function formatMLA(s: SourceFields, page?: number | null): CitationOutput {
  const authors = splitAuthors(s.authors).map(mlaName)
  const authorStr = joinAuthorsMLA(authors)
  const year = s.year || 'بلا تاريخ'
  let full = ''
  switch (s.type) {
    case 'journal':
      full = `${authorStr ? authorStr + '. ' : ''}"${s.title}." *${s.journal || 'مجلة'}*`
      if (s.volume) full += `، المجلد ${s.volume}`
      if (s.issue) full += `، العدد ${s.issue}`
      full += `، ${year}`
      if (s.pagesRange) full += `، ص. ${s.pagesRange}`
      full += '.'
      break
    case 'web':
      full = `${authorStr ? authorStr + '. ' : ''}"${s.title}." ${s.siteName || 'موقع إلكتروني'}.`
      if (s.year) full += ` ${year}`
      if (s.url) full += ` ${s.url}`
      full += '.'
      break
    case 'thesis':
      full = `${authorStr ? authorStr + '. ' : ''}*${s.title}.* ${year}. ${s.publisher || ''}.`
      break
    default: // book
      full = `${authorStr ? authorStr + '. ' : ''}*${s.title}.*`
      if (s.publisher) full += ` ${s.publisher}`
      full += `، ${year}.`
  }
  const short = authorShortForInText(splitAuthors(s.authors))
  const inText = `(${short}${page ? ` ${page}` : ''})`
  return { style: 'mla', label: 'MLA', full, inText }
}

function formatChicago(s: SourceFields, page?: number | null): CitationOutput {
  const authors = splitAuthors(s.authors).map(mlaName)
  const authorStr = joinAuthorsMLA(authors)
  const year = s.year || 'بلا تاريخ'
  let full = ''
  switch (s.type) {
    case 'journal':
      full = `${authorStr ? authorStr + '. ' : ''}"${s.title}." *${s.journal || 'مجلة'}*`
      if (s.volume) full += ` ${s.volume}`
      if (s.issue) full += `، رقم ${s.issue}`
      full += ` (${year})`
      if (s.pagesRange) full += `: ${s.pagesRange}`
      full += '.'
      break
    case 'web':
      full = `${authorStr ? authorStr + '. ' : ''}"${s.title}." ${s.siteName || 'موقع'}. ${year}.`
      if (s.url) full += ` ${s.url}`
      full += '.'
      break
    case 'thesis':
      full = `${authorStr ? authorStr + '. ' : ''}"${s.title}." رسالة ماجستير، ${s.publisher || ''}، ${year}.`
      break
    default:
      full = `${authorStr ? authorStr + '. ' : ''}*${s.title}.*`
      if (s.city) full += ` ${s.city}:`
      if (s.publisher) full += ` ${s.publisher}`
      full += `، ${year}.`
  }
  const short = authorShortForInText(splitAuthors(s.authors))
  const inText = `(${short}، ${year}${page ? `، ${page}` : ''})`
  return { style: 'chicago', label: 'Chicago', full, inText }
}

function formatHarvard(s: SourceFields, page?: number | null): CitationOutput {
  const authors = splitAuthors(s.authors).map(toInitials)
  const authorStr = joinAuthorsAPA(authors) || 'بدون مؤلف'
  const year = s.year || 'بلا تاريخ'
  const edition = s.edition ? ` الطعة ${s.edition}.` : ''
  let full = ''
  switch (s.type) {
    case 'journal':
      full = `${authorStr} ${year}, '${s.title}', *${s.journal || 'مجلة'}*`
      if (s.volume) full += `، المجلد ${s.volume}`
      if (s.issue) full += `(${s.issue})`
      if (s.pagesRange) full += `، ص. ${s.pagesRange}`
      full += '.'
      break
    case 'web':
      full = `${authorStr} ${year}, *${s.title}*, ${s.siteName || 'موقع'}.`
      if (s.url) full += ` متاح على: <${s.url}>`
      break
    case 'thesis':
      full = `${authorStr} ${year}, *${s.title}*, رسالة ماجستير، ${s.publisher || ''}.`
      break
    default:
      full = `${authorStr} ${year}, *${s.title}*.${edition} ${s.publisher || ''}.`.trim() + '.'
  }
  const short = authorShortForInText(splitAuthors(s.authors))
  const inText = `(${short}، ${year}${page ? `، ص. ${page}` : ''})`
  return { style: 'harvard', label: 'Harvard', full, inText }
}

export function formatCitation(
  s: SourceFields,
  style: CitationStyle,
  page?: number | null,
): CitationOutput {
  const enriched = { ...s, siteName: s.publisher }
  switch (style) {
    case 'apa':
      return formatAPA(enriched, page)
    case 'mla':
      return formatMLA(enriched, page)
    case 'chicago':
      return formatChicago(enriched, page)
    case 'harvard':
      return formatHarvard(enriched, page)
  }
}

export function formatAll(s: SourceFields, page?: number | null): CitationOutput[] {
  return (['apa', 'mla', 'chicago', 'harvard'] as CitationStyle[]).map((st) => formatCitation(s, st, page))
}

export const STYLE_LABELS: Record<CitationStyle, string> = {
  apa: 'APA (الإصدار 7)',
  mla: 'MLA (الإصدار 9)',
  chicago: 'Chicago',
  harvard: 'Harvard',
}
