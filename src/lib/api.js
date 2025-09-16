export function getApiBase() {
  let base = import.meta?.env?.VITE_API_BASE_URL
  if (!base) return '/api'
  base = base.toString().trim()
  // remove trailing slash to avoid double slashes when concatenating
  if (base.endsWith('/')) base = base.slice(0, -1)
  // Dev-time debug: print resolved base so developers can see where requests go
  if (import.meta.env && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[getApiBase] resolved API base:', base)
  }
  // Ensure API base points to API root. If user set a host without /api, append it.
  if (!base.includes('/api')) {
    // remove trailing slash (already removed above) and append /api
    base = `${base}/api`
  }
  return base || '/api'
}

export async function apiLogin({ username, password }) {
  const res = await fetch(`${getApiBase()}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.error || (res.status === 400 ? 'Username & password required' : res.status === 401 ? 'Invalid credentials' : 'Login failed')
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

export async function apiUploadZip(file, token) {
  if (!file) throw new Error('zip file required')
  const form = new FormData()
  form.append('zip', file)

  const res = await fetch(`${getApiBase()}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.error || (res.status === 400 ? 'Invalid upload request' : 'Upload failed')
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

export async function apiGetChats(token) {
  const res = await fetch(`${getApiBase()}/chats`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.error || 'Failed to fetch chats'
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

export async function apiGetMessages(chatId, token, options = {}) {
  const { page = 1, limit = 100, search } = options
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
  if (search) params.append('search', search)
  
  const res = await fetch(`${getApiBase()}/chats/${chatId}/messages?${params}`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.error || 'Failed to fetch messages'
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

export async function apiDeleteAllChats(token) {
  const res = await fetch(`${getApiBase()}/chats`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.error || 'Failed to delete chats'
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

export async function apiDeleteSelectedChats(ids = [], token) {
  // Ensure numeric-looking ids are sent as numbers
  const normalizedIds = (ids || []).map(id => {
    if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id)
    return id
  })

  const res = await fetch(`${getApiBase()}/chats/selected`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ids: normalizedIds })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.error || 'Failed to delete selected chats'
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

export async function apiDeleteChat(id, token) {
  if (!id) throw new Error('chat id required')
  const res = await fetch(`${getApiBase()}/chats/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.error || 'Failed to delete chat'
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

 