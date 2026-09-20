import { handleMemoryRequest } from './_lib/memory.js'

export const GET = handleMemoryRequest
export const POST = handleMemoryRequest
// Route unsupported methods through the same authentication and no-store handling.
export const PUT = handleMemoryRequest
export const PATCH = handleMemoryRequest
export const DELETE = handleMemoryRequest
export const HEAD = handleMemoryRequest
export const OPTIONS = handleMemoryRequest
