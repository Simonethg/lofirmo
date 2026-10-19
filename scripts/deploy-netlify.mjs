#!/usr/bin/env node
/**
 * One-command Netlify deploy for Vigía (Celo mainnet, x402 on /api/check).
 *   NETLIFY_AUTH_TOKEN=... X402_API_KEY=... node scripts/deploy-netlify.mjs
 * - Creates the site (first free name of: vigia, vigia-celo, vigia-check) or reuses the one in .netlify/state.json.
 * - Sets the site env through the Netlify API: X402_ENABLED, X402_FACILITATOR_URL, X402_NETWORK, X402_PAY_TO, X402_API_KEY.
 *   MAINNET_SENDS_ENABLED is never set. No private key ever goes to the host. Secret values are never printed.
 * - Runs ONE production deploy (`netlify deploy --build --prod`) with wallet keys removed from the build env.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const token = process.env.NETLIFY_AUTH_TOKEN
const apiKey = (process.env.X402_API_KEY ?? '').trim()
if (!token) { console.error('NETLIFY_AUTH_TOKEN is not set'); process.exit(1) }
if (!apiKey) { console.error('X402_API_KEY is not set'); process.exit(1) }

const PAY_TO = process.env.X402_PAY_TO || '0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2'
const NAMES = (process.env.NETLIFY_SITE_NAMES || 'vigia,vigia-celo,vigia-check').split(',')
const ENV = {
  X402_ENABLED: 'true',
  X402_FACILITATOR_URL: 'https://api.x402.celo.org',
  X402_NETWORK: 'celo',
  X402_PAY_TO: PAY_TO,
  X402_API_KEY: apiKey,
}
const SECRET = new Set(['X402_API_KEY'])

async function api(method, path, body) {
  const r = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, ok: r.ok, j }
}

async function main() {
  const accounts = await api('GET', '/accounts')
  if (!accounts.ok || !accounts.j[0]) throw new Error(`cannot list Netlify accounts (HTTP ${accounts.status})`)
  const account = process.env.NETLIFY_ACCOUNT_SLUG || accounts.j[0].slug

  let site
  const statePath = '.netlify/state.json'
  const saved = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')).siteId : undefined
  if (saved) {
    const s = await api('GET', `/sites/${saved}`)
    if (s.ok) site = s.j
  }
  for (const name of NAMES) {
    if (site) break
    const c = await api('POST', `/${account}/sites`, { name })
    if (c.ok) site = c.j
    else console.log(`site name "${name}" not available (HTTP ${c.status})`)
  }
  if (!site) throw new Error('could not create a site; set NETLIFY_SITE_NAMES')
  mkdirSync('.netlify', { recursive: true })
  writeFileSync(statePath, JSON.stringify({ siteId: site.id }, null, 2))
  console.log(`site: ${site.name} ${site.ssl_url || site.url} (id ${site.id}, account ${account})`)

  for (const [key, value] of Object.entries(ENV)) {
    const entry = { key, scopes: ['builds', 'functions', 'runtime'], ...(SECRET.has(key)
      ? { is_secret: true, values: [{ value, context: 'production' }] } // Netlify secrets take explicit contexts
      : { values: [{ value, context: 'all' }] }) }
    let r = await api('POST', `/accounts/${account}/env?site_id=${site.id}`, [entry])
    if (!r.ok) r = await api('PUT', `/accounts/${account}/env/${key}?site_id=${site.id}`, entry)
    if (!r.ok) throw new Error(`setting ${key} failed (HTTP ${r.status})`)
    console.log(`env ${key} set${SECRET.has(key) ? ' (secret, value hidden)' : `=${value}`}`)
  }

  const env = { ...process.env }
  for (const k of ['CELO_DEPLOYER_PRIVATE_KEY', 'PAYER_PRIVATE_KEY', 'PAYER_KEY_FILE', 'MAINNET_SENDS_ENABLED', 'OPENAI_API_KEY', 'HF_TOKEN']) delete env[k]
  const d = spawnSync('netlify', ['deploy', '--build', '--prod', '--site', site.id, '--message', 'Vigía mainnet deploy'], { stdio: 'inherit', env })
  if (d.status !== 0) process.exit(d.status ?? 1)
  console.log(`\nPublic URL: ${site.ssl_url || site.url}`)
}
main().catch((e) => { console.error('error:', e.message); process.exit(1) })
