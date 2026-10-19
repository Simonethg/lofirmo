import { check, type CheckResult } from './analyze'
import { currentNetwork } from './config'
import { readPayParams, type PayParams } from './pay'

export type PaySearchParams = Record<string, string | string[] | undefined>

export interface PayCheck {
  params?: PayParams
  result?: CheckResult
  error?: string
}

/**
 * Server-side check for the /pay page. It calls the analyzer directly, NOT /api/check:
 * people opening a payment link never pay, x402 stays on /api/check for agents and apps,
 * and no new unpaid JSON endpoint exists (the result only leaves the server as the rendered page).
 */
export async function checkForPay(sp: PaySearchParams, run: typeof check = check): Promise<PayCheck> {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') q.set(k, v)
  let params: PayParams
  try {
    params = readPayParams(q)
  } catch (e) {
    return { error: (e as Error).message }
  }
  try {
    const result = await run(params.link, { network: currentNetwork(), expectedAmount: params.expectedAmount })
    // plain JSON so it can cross into the client component
    return { params, result: JSON.parse(JSON.stringify(result)) as CheckResult }
  } catch (e) {
    return { params, error: (e as Error).message }
  }
}
