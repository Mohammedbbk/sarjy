/**
 * GET /api/tasks — the demo team's open Linear tickets.
 *
 * Deployed as a Vercel Function (Node.js runtime, Web Handler signature) and
 * served by the same code in `pnpm dev` through the dev-api Vite plugin.
 */
import { handleTasksRequest } from './_lib/tasks'

export function GET(request: Request): Promise<Response> {
  return handleTasksRequest(request)
}
