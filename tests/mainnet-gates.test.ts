import { afterEach, describe, expect, it, vi } from 'vitest'

const provider = { request: async () => { throw new Error('not used') }, isMiniPay: true }

describe('mainnet gates', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

  it('MiniPay mainnet Pay is off unless NEXT_PUBLIC_MINIPAY_MAINNET_PAY=true', async () => {
    vi.stubGlobal('window', { ethereum: provider })
    const { walletClient } = await import('@/lib/wallet')
    expect(() => walletClient('mainnet')).toThrow(/not enabled/)
  })

  it('NEXT_PUBLIC_MINIPAY_MAINNET_PAY=true enables the user-wallet client on mainnet', async () => {
    vi.stubEnv('NEXT_PUBLIC_MINIPAY_MAINNET_PAY', 'true')
    vi.stubGlobal('window', { ethereum: provider })
    const { walletClient } = await import('@/lib/wallet')
    expect(() => walletClient('mainnet')).not.toThrow()
  })

  it('the MiniPay flag does NOT enable operator sends from our own wallet', async () => {
    vi.stubEnv('NEXT_PUBLIC_MINIPAY_MAINNET_PAY', 'true')
    vi.stubEnv('CELO_DEPLOYER_PRIVATE_KEY', '0x' + '11'.repeat(32))
    const { serverWallet } = await import('@/lib/serverWallet')
    expect(() => serverWallet('mainnet')).toThrow(/disabled/)
  })
})
