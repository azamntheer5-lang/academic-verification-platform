import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server, Socket } from 'socket.io'

// ── Currency configuration ────────────────────────────────────────────────────
interface CurrencyDef {
  symbol: string
  base: number
  volatility: number // per-tick standard deviation as fraction of price
  decimals: number
  name: string
  category: 'forex' | 'crypto' | 'metal'
}

const CURRENCIES: CurrencyDef[] = [
  { symbol: 'USD/SAR', base: 3.7508, volatility: 0.0004, decimals: 4, name: 'دولار-ريال سعودي', category: 'forex' },
  { symbol: 'USD/AED', base: 3.6730, volatility: 0.0003, decimals: 4, name: 'دولار-درهم إماراتي', category: 'forex' },
  { symbol: 'USD/EGP', base: 48.42, volatility: 0.0012, decimals: 3, name: 'دولار-جنيه مصري', category: 'forex' },
  { symbol: 'USD/QAR', base: 3.6400, volatility: 0.0003, decimals: 4, name: 'دولار-ريال قطري', category: 'forex' },
  { symbol: 'USD/KWD', base: 0.3072, volatility: 0.0004, decimals: 4, name: 'دولار-دينار كويتي', category: 'forex' },
  { symbol: 'USD/TRY', base: 34.21, volatility: 0.0015, decimals: 3, name: 'دولار-ليرة تركية', category: 'forex' },
  { symbol: 'EUR/USD', base: 1.0856, volatility: 0.0004, decimals: 4, name: 'يورو-دولار', category: 'forex' },
  { symbol: 'GBP/USD', base: 1.2712, volatility: 0.0004, decimals: 4, name: 'إسترليني-دولار', category: 'forex' },
  { symbol: 'USD/JPY', base: 152.34, volatility: 0.0005, decimals: 2, name: 'دولار-ين ياباني', category: 'forex' },
  { symbol: 'XAU/USD', base: 2352.4, volatility: 0.0009, decimals: 2, name: 'الذهب (أونصة)', category: 'metal' },
  { symbol: 'BTC/USD', base: 67250, volatility: 0.0045, decimals: 1, name: 'بيتكوين', category: 'crypto' },
  { symbol: 'ETH/USD', base: 3212.5, volatility: 0.005, decimals: 2, name: 'إيثيريوم', category: 'crypto' },
]

// ── Runtime state ──────────────────────────────────────────────────────────────
interface TickState {
  symbol: string
  price: number
  prevPrice: number
  open: number
  high: number
  low: number
  changePct: number
  decimals: number
  history: number[] // recent prices for sparkline (newest last)
}

const HISTORY_LEN = 60

const state = new Map<string, TickState>()

for (const c of CURRENCIES) {
  // Seed history with a gentle random walk so sparklines look alive immediately
  const hist: number[] = []
  let p = c.base * (1 + (Math.random() - 0.5) * 0.01)
  for (let i = 0; i < HISTORY_LEN; i++) {
    p = p * (1 + gaussian() * c.volatility)
    hist.push(p)
  }
  const open = hist[0]
  const price = hist[hist.length - 1]
  state.set(c.symbol, {
    symbol: c.symbol,
    price,
    prevPrice: price,
    open,
    high: Math.max(...hist),
    low: Math.min(...hist),
    changePct: ((price - open) / open) * 100,
    decimals: c.decimals,
    history: hist,
  })
}

// Box-Muller transform for normally distributed noise
function gaussian(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function advanceAll(): TickState[] {
  const out: TickState[] = []
  for (const c of CURRENCIES) {
    const s = state.get(c.symbol)!
    s.prevPrice = s.price
    // Random walk with slight mean reversion toward base
    const reversion = (c.base - s.price) / c.base * 0.02
    const next = s.price * (1 + gaussian() * c.volatility + reversion)
    s.price = next
    s.history.push(next)
    if (s.history.length > HISTORY_LEN) s.history.shift()
    s.high = Math.max(s.high, next)
    s.low = Math.min(s.low, next)
    s.changePct = ((next - s.open) / s.open) * 100
    out.push({
      symbol: s.symbol,
      price: s.price,
      prevPrice: s.prevPrice,
      open: s.open,
      high: s.high,
      low: s.low,
      changePct: s.changePct,
      decimals: s.decimals,
      history: s.history.slice(),
    })
  }
  return out
}

// ── HTTP server (health check) ─────────────────────────────────────────────────
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'currency-stream', currencies: CURRENCIES.length }))
    return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ service: 'currency-stream', uptime: process.uptime() }))
})

// ── Socket.IO server ───────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const connectedClients = new Set<Socket>()

io.on('connection', (socket) => {
  connectedClients.add(socket)
  console.log(`[+] client connected: ${socket.id} (total ${connectedClients.size})`)

  // Send a full snapshot immediately so the client can render without waiting
  socket.emit('snapshot', {
    ts: Date.now(),
    currencies: Array.from(state.values()).map((s) => ({
      symbol: s.symbol,
      price: s.price,
      prevPrice: s.prevPrice,
      open: s.open,
      high: s.high,
      low: s.low,
      changePct: s.changePct,
      decimals: s.decimals,
      history: s.history.slice(),
    })),
  })

  socket.on('disconnect', () => {
    connectedClients.delete(socket)
    console.log(`[-] client disconnected: ${socket.id} (total ${connectedClients.size})`)
  })

  socket.on('error', (err: unknown) => {
    console.error(`socket error (${socket.id}):`, err)
  })
})

// Broadcast tick every 1500ms
const TICK_MS = 1500
setInterval(() => {
  const ticks = advanceAll()
  if (connectedClients.size > 0) {
    io.emit('tick', { ts: Date.now(), currencies: ticks })
  }
}, TICK_MS)

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`╔════════════════════════════════════════════╗`)
  console.log(`║  CURRENCY STREAM · WebSocket live feed     ║`)
  console.log(`║  port ${PORT} · ${CURRENCIES.length} instruments · ${TICK_MS}ms tick ║`)
  console.log(`╚════════════════════════════════════════════╝`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...')
  io.close()
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...')
  io.close()
  httpServer.close(() => process.exit(0))
})
