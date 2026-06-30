// ── Verify Engine: APA 7 citation formatter ──────────────────────────────────

export function formatApa7(
  title: string,
  authors: string[],
  year: string,
  publisher: string,
): string {
  let authorStr: string
  if (authors.length === 0) {
    authorStr = 'Unknown'
  } else {
    const parts = authors.map((a) => toInitials(a))
    if (parts.length === 1) authorStr = parts[0]
    else if (parts.length === 2) authorStr = `${parts[0]} & ${parts[1]}`
    else authorStr = `${parts[0]} et al.`
  }
  const y = year || 'n.d.'
  let out = `${authorStr} (${y}). *${title}*.`
  if (publisher) out += ` ${publisher}.`
  return out
}

function toInitials(name: string): string {
  const n = name.trim()
  if (!n) return ''
  if (n.includes(',')) {
    const [last, rest] = n.split(',', 2).map((s) => s.trim())
    const initials = rest
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + '.')
      .join(' ')
    return `${last}, ${initials}`.trim()
  }
  const bits = n.split(/\s+/).filter(Boolean)
  if (bits.length === 1) return bits[0]
  const initials = bits.slice(0, -1).map((w) => w.charAt(0).toUpperCase() + '.').join(' ')
  return `${initials} ${bits[bits.length - 1]}`.trim()
}
