/**
 * api.js — Centralised fetch wrapper
 * - Attaches Authorization header from in-memory accessToken
 * - On 401, attempts one silent token refresh via the httpOnly cookie
 * - Throws { error: string } on API errors so callers can handle cleanly
 */

const BASE = 'https://labour-dice-jacket-charleston.trycloudflare.com/api';

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

// ── Core fetch wrapper ────────────────────────────────────────

async function request(path, options = {}, retry = true) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include', // send cookies (refresh token)
  });

  // Try silent token refresh on 401
  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request(path, options, false);
    // Refresh failed — redirect to login
    clearAccessToken();
    window.location.href = '/login.html';
    return;
  }

  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function tryRefresh() {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

// ── Convenience methods ───────────────────────────────────────

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

// ── Auth helpers ──────────────────────────────────────────────

export const auth = {
  async register({ email, password, displayName }) {
    const data = await api.post('/auth/register', { email, password, displayName });
    setAccessToken(data.accessToken);
    return data.user;
  },

  async login({ email, password }) {
    const data = await api.post('/auth/login', { email, password });
    console.log('Login successful, received access token:', data.accessToken);
    setAccessToken(data.accessToken);
    return data.user;
  },

  async logout() {
    await api.post('/auth/logout');
    clearAccessToken();
  },

  async getMe() {
    const data = await api.get('/auth/me');
    return data.user;
  },

  async updateMe(updates) {
    const data = await api.patch('/auth/me', updates);
    return data.user;
  },

  // Called on page load — silently restore session if refresh cookie exists
  async restoreSession() {
    const refreshed = await tryRefresh();
    if (!refreshed) return null;
    try {
      return await auth.getMe();
    } catch {
      return null;
    }
  },
};

// ── Exercise helpers ──────────────────────────────────────────

export const exercises = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/exercises${qs ? '?' + qs : ''}`);
  },
  get: (id) => api.get(`/exercises/${id}`),
  getStatus: (id) => api.get(`/exercises/${id}/status`),
  create: (youtubeUrl, opts = {}) => api.post('/exercises', { youtubeUrl, ...opts }),
  update: (id, updates) => api.patch(`/exercises/${id}`, updates),
  delete: (id) => api.delete(`/exercises/${id}`),
  retryTranscript: (id) => api.post(`/exercises/${id}/retry-transcript`),
};

// ── Progress helpers ──────────────────────────────────────────

export const progress = {
  getAll: () => api.get('/progress'),
  get: (exerciseId) => api.get(`/progress/${exerciseId}`),
  start: (exerciseId) => api.post(`/progress/${exerciseId}/start`),
  pass: (exerciseId, body) => api.post(`/progress/${exerciseId}/pass`, body),
  complete: (exerciseId) => api.post(`/progress/${exerciseId}/complete`),
  reset: (exerciseId) => api.post(`/progress/${exerciseId}/reset`),
};

// ── Stats helpers ─────────────────────────────────────────────

export const stats = {
  me: () => api.get('/stats/me'),
  activity: (from, to) => {
    const qs = new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString();
    return api.get(`/stats/me/activity${qs ? '?' + qs : ''}`);
  },
  exercises: () => api.get('/stats/me/exercises'),
};
