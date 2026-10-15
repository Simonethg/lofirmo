import { NextResponse } from 'next/server'
import { check } from '@/lib/analyze'
import { currentNetwork } from '@/lib/config'
import { gate } from '@/lib/x402'
import type { Network } from '@/lib/tokens'

export const runtime = 'nodejs'

async function handle(req: Request, body: Record<string, unknown>) {
  const g = await gate(req.headers, new URL(req.url).pathname)
  if (!g.ok) return NextResponse.json(g.body, { status: g.status })
  const network: Network = body.network === 'mainnet' ? 'mainnet' : body.network === 'sepolia' ? 'sepolia' : currentNetwork()
  const input = (body.tx as Record<string, string> | undefined) ?? (body.input as string | undefined)
  if (!input) return NextResponse.json({ error: 'Falta "input" (dirección / link) o "tx" ({to,data,value,from,feeCurrency})' }, { status: 400 })
  try {
    const r = await check(input, { network, expectedAmount: body.expectedAmount as string | undefined })
    return NextResponse.json(r, g.settlement ? { headers: { 'x-payment-response': Buffer.from(JSON.stringify(g.settlement)).toString('base64') } } : undefined)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  return handle(req, body)
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  return handle(req, { input: q.get('input') ?? undefined, network: q.get('network') ?? undefined, expectedAmount: q.get('expectedAmount') ?? undefined })
}
