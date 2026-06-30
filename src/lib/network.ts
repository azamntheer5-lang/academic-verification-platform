// M7 — Reference network graph.
// We build a citation network from the researcher's extracted citations.
// Nodes = cited authors/works. Edges = relationships discovered by searching
// the web for "A cites B" between two cited authors. As a fast heuristic we
// also add co-citation edges (two authors cited together in the same research
// → likely related), and LLM-suggested "missing foundational author" nodes.

import ZAI from 'z-ai-web-dev-sdk'

export interface GraphNode {
  id: string
  label: string
  author: string
  year?: string
  type: 'cited' | 'suggested'
  weight: number // = number of times cited
}

export interface GraphEdge {
  source: string
  target: string
  relation: 'cites' | 'co_cite' | 'suggests'
  weight: number
  evidence?: string
}

export interface ReferenceGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  suggestions: { author: string; reason: string }[]
}

function nodeKey(author: string): string {
  const a = author.trim()
  if (!a) return 'unknown'
  return a.includes(',') ? a.split(',')[0].trim().toLowerCase() : a.split(/\s+/).slice(-1)[0].toLowerCase()
}

function shortLabel(author: string): string {
  const a = author.trim()
  if (!a) return 'غير معروف'
  if (a.includes(',')) return a.split(',')[0].trim()
  return a.split(/\s+/).slice(-1)[0]
}

// Build a base graph from the citation list: nodes per cited author, with
// weight = citation count. Add co-citation edges between every pair of
// distinctly-cited authors (they appear together in this research).
export function buildBaseGraph(
  citations: { author: string; year?: string; title?: string }[],
): ReferenceGraph {
  const nodeMap = new Map<string, GraphNode>()
  for (const c of citations) {
    const key = nodeKey(c.author)
    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        id: key,
        label: shortLabel(c.author),
        author: c.author,
        year: c.year,
        type: 'cited',
        weight: 0,
      })
    }
    const node = nodeMap.get(key)!
    node.weight++
  }

  const nodes = [...nodeMap.values()]
  const edges: GraphEdge[] = []
  // co-citation: every pair of cited authors is co-cited in this research
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      edges.push({
        source: nodes[i].id,
        target: nodes[j].id,
        relation: 'co_cite',
        weight: Math.min(nodes[i].weight, nodes[j].weight),
      })
    }
  }
  return { nodes, edges, suggestions: [] }
}

// Enrich the graph: for each pair of cited authors, do ONE web search to find
// whether A cites B. To keep it cheap we cap the number of searches.
export async function enrichGraphWithCitations(
  graph: ReferenceGraph,
  maxSearches = 4,
): Promise<ReferenceGraph> {
  const { nodes } = graph
  if (nodes.length < 2) return graph

  // Pick the most-cited pairs to check (limit API calls)
  const pairs: [GraphNode, GraphNode][] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue
      pairs.push([nodes[i], nodes[j]])
    }
  }
  // dedupe (A→B and B→A are different direction searches, keep both but cap)
  const toCheck = pairs.slice(0, maxSearches)
  const newEdges: GraphEdge[] = [...graph.edges]
  const seen = new Set<string>()

  try {
    const zai = await ZAI.create()
    for (const [a, b] of toCheck) {
      const k = `${a.id}>${b.id}`
      if (seen.has(k)) continue
      seen.add(k)
      try {
        const results = await zai.functions.invoke('web_search', {
          query: `does ${a.author} cite ${b.author} reference bibliography`,
          num: 4,
        })
        if (!Array.isArray(results)) continue
        for (const r of results as { snippet?: string; name?: string; url?: string }[]) {
          const text = `${r.name || ''} ${r.snippet || ''}`
          if (
            text.toLowerCase().includes(a.label.toLowerCase()) &&
            text.toLowerCase().includes(b.label.toLowerCase()) &&
            /\bcite|reference|builds? on|based on|draws? on\b/i.test(text)
          ) {
            newEdges.push({
              source: a.id,
              target: b.id,
              relation: 'cites',
              weight: 2,
              evidence: r.url,
            })
            break
          }
        }
      } catch {
        /* ignore single-pair failure */
      }
    }
  } catch {
    /* zai init failed — return base graph */
  }

  return { ...graph, edges: newEdges }
}

// Suggest a "missing foundational author" the researcher didn't cite.
export async function suggestMissingAuthor(
  graph: ReferenceGraph,
  topicHint: string,
): Promise<{ author: string; reason: string }[]> {
  const cited = graph.nodes.map((n) => n.author).join('، ')
  if (!cited) return []
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `أنت خبير أكاديمي. سيُعطاك قائمة بالعلماء الذين اقتبس منهم باحث في موضوع معين. اقترح 1-3 علماء أساسيين ( Foundational) يُعتبرون الأب الروحي للفكرة ولم يُذكروا في القائمة. أعد JSON صارم: {"suggestions":[{"author":"اسم العالم","reason":"سبب بالعربية"}]}. لا تكتب شيئاً خارج JSON.`,
        },
        {
          role: 'user',
          content: `الموضوع: ${topicHint || 'غير محدد'}\nالعلماء المُقتبس منهم: ${cited}`,
        },
      ],
      thinking: { type: 'disabled' },
    })
    const raw = completion.choices[0]?.message?.content || ''
    const parsed = parseJsonLoose(raw)
    const arr = Array.isArray(parsed?.suggestions) ? parsed.suggestions : []
    return (arr as { author: string; reason: string }[]).map((s) => ({
      author: String(s.author || ''),
      reason: String(s.reason || ''),
    }))
  } catch {
    return []
  }
}

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  const t = raw.replace(/```json/gi, '```').replace(/```/g, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}
