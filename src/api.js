// Thin client over the yt-dlp FastAPI backend.
// In dev, requests go to /api which Vite proxies to the real host (no CORS pain).

const BASE = import.meta.env.VITE_API_BASE ?? ''

const TOKEN_KEY = 'ytdlp.jwt'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || null
}
export function setToken(tok) {
  if (tok) localStorage.setItem(TOKEN_KEY, tok)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body, auth = false, raw = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const tok = getToken()
    if (!tok) throw new ApiError('not authenticated — run `login <user> <pass>`', 401)
    headers['Authorization'] = `Bearer ${tok}`
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    throw new ApiError(`network failure: ${e.message}`, 0)
  }

  if (raw) {
    if (!res.ok) throw new ApiError(await readError(res), res.status)
    return res
  }

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }

  if (!res.ok) {
    throw new ApiError(extractError(data) || `HTTP ${res.status}`, res.status, data)
  }
  return data
}

function extractError(data) {
  if (!data) return null
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail)) {
    return data.detail.map((d) => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ')
  }
  if (data.message) return data.message
  return null
}

async function readError(res) {
  try {
    const j = await res.json()
    return extractError(j) || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export const api = {
  health: () => request('/api/health'),
  register: (username, password) =>
    request('/api/auth/register', { method: 'POST', body: { username, password } }),
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/api/auth/me', { auth: true }),
  info: (url) => request(`/api/info?url=${encodeURIComponent(url)}`, { auth: true }),
  download: (url, format_id, quality) =>
    request('/api/download', {
      method: 'POST',
      auth: true,
      body: clean({ url, format_id, quality }),
    }),
  convert: (url, audio_quality) =>
    request('/api/convert', {
      method: 'POST',
      auth: true,
      body: clean({ url, audio_quality }),
    }),
  stream: (url, format_id, quality) =>
    request('/api/stream', {
      method: 'POST',
      auth: true,
      raw: true,
      body: clean({ url, format_id, quality }),
    }),
}

function clean(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}
