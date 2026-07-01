// ── Verify Engine: dynamic citation formatters (Module 3) ────────────────────
// Takes a verified reference object and renders it in the requested style.
// Supported: APA 7, MLA 9, Chicago (Notes-Bib), Harvard, KSU (King Saud
// University), Cairo University. The two Arab university styles are
// localized variants — full author name in bold, year in brackets, publisher
// city mandatory — emulating the published thesis guidelines of each.

import type { AlternativeReference, FormatStyle } from './models'

export interface FormattableRef {
  title: string
  authors: string[] // raw "Last, First" or "First Last" entries
  year: string
  publisher?: string
  city?: string
  page?: string | null
}

// ── author parsing helpers ────────────────────────────────────────────────────

// "Smith, John Arthur" -> "Smith, J. A." (APA / Harvard initials style)
function toInitials(name: string): string {
  const n = name.trim()
  if (!n) return ''
  if (n.includes(',')) {
    const [last, rest] = n.split(',', 2).map((s) => s.trim())
    const initials = rest.split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + '.').join(' ')
    return `${last}, ${initials}`.trim()
  }
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  const initials = parts.slice(0, -1).map((w) => w.charAt(0).toUpperCase() + '.').join(' ')
  return `${initials} ${parts[parts.length - 1]}`.trim()
}

// "John Arthur Smith" -> "Smith, John Arthur" (MLA / Chicago / Arab full-name)
function toLastFirst(name: string): string {
  const n = name.trim()
  if (!n) return ''
  if (n.includes(',')) return n
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
}

function joinAuthorsAPA(authors: string[]): string {
  const formatted = authors.map(toInitials).filter(Boolean)
  if (formatted.length === 0) return 'بدون مؤلف'
  if (formatted.length === 1) return formatted[0]
  if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`
  return `${formatted[0]} et al.`
}

function joinAuthorsMLA(authors: string[]): string {
  const formatted = authors.map(toLastFirst).filter(Boolean)
  if (formatted.length === 0) return ''
  if (formatted.length === 1) return formatted[0]
  if (formatted.length === 2) return `${formatted[0]}, and ${formatted[1]}`
  return `${formatted[0]}, et al.`
}

// KSU / Cairo: full author names joined with "و" — first author "Last, First"
function joinAuthorsArab(authors: string[]): string {
  const formatted = authors.map(toLastFirst).filter(Boolean)
  if (formatted.length === 0) return 'بدون مؤلف'
  if (formatted.length === 1) return formatted[0]
  if (formatted.length === 2) return `${formatted[0]} و ${formatted[1]}`
  return `${formatted[0]} وآخرون`
}

// ── per-style formatters ──────────────────────────────────────────────────────

function formatAPA7(r: FormattableRef): string {
  const authorStr = joinAuthorsAPA(r.authors)
  const y = r.year || 'n.d.'
  let out = `${authorStr} (${y}). *${r.title}*.`
  if (r.publisher) out += ` ${r.publisher}.`
  if (r.page) out += ` (ص. ${r.page})`
  return out
}

function formatMLA9(r: FormattableRef): string {
  const authorStr = joinAuthorsMLA(r.authors)
  let out = authorStr ? `${authorStr}. ` : ''
  out += `*${r.title}.*`
  if (r.publisher) out += ` ${r.publisher},`
  out += ` ${r.year || 'n.d.'}.`
  if (r.page) out += ` ص. ${r.page}.`
  return out
}

function formatChicago(r: FormattableRef): string {
  const authorStr = joinAuthorsMLA(r.authors)
  let out = authorStr ? `${authorStr}. ` : ''
  out += `*${r.title}.*`
  if (r.city) out += ` ${r.city}:`
  if (r.publisher) out += ` ${r.publisher},`
  out += ` ${r.year || 'n.d.'}.`
  return out
}

function formatHarvard(r: FormattableRef): string {
  const authorStr = joinAuthorsAPA(r.authors)
  const y = r.year || 'n.d.'
  let out = `${authorStr} ${y}, *${r.title}*,`
  if (r.publisher) out += ` ${r.publisher}`
  if (r.page) out += `, ص. ${r.page}`
  return out + '.'
}

// King Saud University style — full author name in bold, year in brackets,
// italicized title, publisher + city. Markup uses ** for bold (markdown).
function formatKSU(r: FormattableRef): string {
  const authorStr = joinAuthorsArab(r.authors)
  let out = `**${authorStr}** [${r.year || 'بلا تاريخ'}]. `
  out += `*${r.title}*.`
  if (r.city && r.publisher) out += ` ${r.city}: ${r.publisher}.`
  else if (r.publisher) out += ` ${r.publisher}.`
  if (r.page) out += ` ص ${r.page}.`
  return out
}

// Cairo University style — author in parentheses, italic title, square
// brackets around the year. Markup uses * for italic.
function formatCairo(r: FormattableRef): string {
  const authorStr = joinAuthorsArab(r.authors)
  let out = `(${authorStr}) [${r.year || 'بلا تاريخ'}]. `
  out += `«${r.title}».` // guillemets instead of italics for Arabic convention
  if (r.publisher) out += ` ${r.publisher}.`
  if (r.page) out += ` ص ${r.page}.`
  return out
}

// ── dispatcher ────────────────────────────────────────────────────────────────
export function formatReference(ref: FormattableRef, style: FormatStyle): string {
  switch (style) {
    case 'apa7':
      return formatAPA7(ref)
    case 'mla9':
      return formatMLA9(ref)
    case 'chicago':
      return formatChicago(ref)
    case 'harvard':
      return formatHarvard(ref)
    case 'ksu':
      return formatKSU(ref)
    case 'cairo':
      return formatCairo(ref)
  }
}

// Convenience: format the AlternativeReference shape returned by the library
// fallback (which doesn't carry a city or separate page field).
export function formatAlternative(alt: AlternativeReference, style: FormatStyle): string {
  return formatReference(
    {
      title: alt.title,
      authors: alt.author ? alt.author.split(/,|؛/).map((a) => a.trim()).filter(Boolean) : [],
      year: alt.year,
      publisher: alt.publisher || undefined,
      page: null,
    },
    style,
  )
}

export const STYLE_LABELS: Record<FormatStyle, string> = {
  apa7: 'APA 7',
  mla9: 'MLA 9',
  chicago: 'Chicago',
  harvard: 'Harvard',
  ksu: 'دليل جامعة الملك سعود',
  cairo: 'دليل جامعة القاهرة',
}
