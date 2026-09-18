/**
 * Serves the `api/` folder inside `vite dev`.
 *
 * This is not a proxy to another process: it loads the very same handler module
 * that Vercel deploys as a function and runs it in the dev server, so `pnpm dev`
 * alone gives you a working POST /api/session.
 *
 * Server-side env vars (LIVEKIT_API_KEY and friends) are read from `.env*` files
 * and put on `process.env` for the handler only. They are deliberately not
 * exposed through Vite's `define`, so they can never reach the client bundle.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'

/** Env vars the API needs. Everything else is left alone. */
const SERVER_ENV_KEYS = [
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'SARJY_AGENT_NAME',
  'LIVEKIT_AGENT_DEPLOYMENT',
  'LINEAR_API_KEY',
  'LINEAR_TEAM_KEY',
]

type WebHandler = (request: Request) => Response | Promise<Response>

export function devApi(): Plugin {
  return {
    name: 'sarjy:dev-api',
    apply: 'serve',

    config(_config, { mode }) {
      // `''` as the prefix loads unprefixed vars too — that is the point here.
      const env = loadEnv(mode, process.cwd(), '')
      for (const key of SERVER_ENV_KEYS) {
        if (process.env[key] === undefined && env[key] !== undefined) {
          process.env[key] = env[key]
        }
      }
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const route = apiRoute(req.url)
        if (!route) {
          next()
          return
        }

        void handle(server, route, req, res).catch((error: unknown) => {
          server.ssrFixStacktrace(error as Error)
          console.error(`[dev-api] /api/${route} failed:`, error)
          send(res, 500, {
            error: 'server_not_configured',
            message: 'The local API handler threw. See the dev server output.',
          })
        })
      })
    },
  }
}

async function handle(
  server: ViteDevServer,
  route: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let module: Record<string, unknown>
  try {
    module = await server.ssrLoadModule(`/api/${route}.ts`)
  } catch (error) {
    if (!isModuleNotFound(error)) throw error
    send(res, 404, { error: 'not_found', message: `No handler for /api/${route}.` })
    return
  }

  const handler = pickHandler(module, req.method ?? 'GET')

  if (!handler) {
    send(res, 405, { error: 'invalid_request', message: `${req.method} is not supported here.` })
    return
  }

  await writeResponse(res, await handler(await toWebRequest(req)))
}

/** `/api/session?x=1` -> `session`. `_`-prefixed files are private, as on Vercel. */
function apiRoute(url: string | undefined): string | null {
  if (!url) return null
  const path = url.split('?')[0]
  const match = /^\/api\/([a-zA-Z0-9-]+)$/.exec(path)
  return match ? match[1] : null
}

function pickHandler(module: Record<string, unknown>, method: string): WebHandler | null {
  const byMethod = module[method.toUpperCase()]
  if (typeof byMethod === 'function') return byMethod as WebHandler

  // Also accept Vercel's `export default { fetch }` shape.
  const fallback = module.default as { fetch?: unknown } | undefined
  if (fallback && typeof fallback.fetch === 'function') return fallback.fetch as WebHandler

  return null
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) headers.append(key, entry)
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const body = hasBody ? await readBody(req) : undefined

  return new Request(url, { method: req.method, headers, body })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      raw += chunk
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(await response.text())
}

/** Vite reports a missing route file as a resolve failure. */
function isModuleNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return message.includes('Failed to load url') || message.includes('ENOENT')
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) {
    res.end()
    return
  }
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}
