// Thin fetch wrapper. Session-cookie auth (credentials: 'include'); typed errors so
// the UI can distinguish 401 (auth), 409 (conflict — the money path), and 422
// (validation) without string-matching. Django CSRF header is attached on unsafe
// methods when the cookie is present (harmless if the backend doesn't require it).

export class ApiError extends Error {
  status: number
  detail: string
  body: unknown
  constructor(status: number, detail: string, body: unknown) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.body = body
  }
  get isAuth() {
    return this.status === 401
  }
  get isConflict() {
    return this.status === 409
  }
  get isValidation() {
    return this.status === 422 || this.status === 400
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (UNSAFE.has(method)) {
    const csrf = getCookie('csrftoken')
    if (csrf) headers.set('X-CSRFToken', csrf)
  }

  const res = await fetch(path, { ...init, method, headers, credentials: 'include' })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const body = text ? safeJson(text) : null

  if (!res.ok) {
    const detail =
      (body && typeof body === 'object' && 'detail' in body && String((body as Record<string, unknown>).detail)) ||
      res.statusText ||
      'Request failed'
    throw new ApiError(res.status, detail, body)
  }
  return body as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
