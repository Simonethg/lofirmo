import { checkForPay, type PaySearchParams } from '@/lib/payCheck'
import { PayView } from './PayView'

/**
 * /pay?link=…&amount=… : the check runs on the server while the page renders (analyzer called directly,
 * not through the paid /api/check), so the person never sees an x402 paywall.
 */
export default async function PayPage({ searchParams }: { searchParams: Promise<PaySearchParams> }) {
  const { params, result, error } = await checkForPay(await searchParams)
  return <PayView params={params} result={result} error={error} />
}
