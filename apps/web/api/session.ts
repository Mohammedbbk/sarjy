/**
 * POST /api/session — issues credentials for one stand-up.
 *
 * Deployed as a Vercel Function (Node.js runtime, Web Handler signature) and
 * served by the same code in `pnpm dev` through the dev-api Vite plugin.
 */
import { handleSessionRequest } from './_lib/session'

export function POST(request: Request): Promise<Response> {
  return handleSessionRequest(request)
}
