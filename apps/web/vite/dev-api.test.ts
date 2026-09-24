import { afterEach, expect, it, vi } from 'vitest'
import { devApi } from './dev-api.ts'

vi.mock('vite', () => ({ loadEnv: () => ({}) }))
afterEach(() => vi.unstubAllEnvs())

function configure() {
  const plugin = devApi()
  const config = plugin.config as (config: object, env: { mode: string }) => void
  config({}, { mode: 'development' })
}

it('routes local calls to a dedicated worker and local API', () => {
  vi.stubEnv('SARJY_AGENT_NAME', undefined)
  vi.stubEnv('SARJY_PUBLIC_API_URL', undefined)
  configure()
  expect(process.env.SARJY_AGENT_NAME).toBe('sarjy-agent-local')
  expect(process.env.SARJY_PUBLIC_API_URL).toBe('http://localhost:5180')
})

it('preserves explicitly configured remote routing', () => {
  vi.stubEnv('SARJY_AGENT_NAME', 'custom-agent')
  vi.stubEnv('SARJY_PUBLIC_API_URL', 'https://example.test')
  configure()
  expect(process.env.SARJY_AGENT_NAME).toBe('custom-agent')
  expect(process.env.SARJY_PUBLIC_API_URL).toBe('https://example.test')
})
