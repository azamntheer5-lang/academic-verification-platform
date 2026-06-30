import { NextResponse } from 'next/server'

// Liveness probe for the currency-stream mini-service (port 3003).
// The real-time data flows over the WebSocket connection; this endpoint just
// tells the client whether the stream service is up so we can show a status
// badge before the first tick arrives.

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  try {
    const res = await fetch('http://localhost:3003/health', { signal: controller.signal })
    clearTimeout(timeout)
    const ok = res.ok
    return NextResponse.json({
      ok,
      streamPort: 3003,
      tickMs: 1500,
      message: ok ? 'stream-live' : 'stream-unreachable',
      ts: Date.now(),
    })
  } catch {
    clearTimeout(timeout)
    return NextResponse.json(
      { ok: false, streamPort: 3003, tickMs: 1500, message: 'stream-unreachable', ts: Date.now() },
      { status: 200 },
    )
  }
}
