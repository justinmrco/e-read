export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');
export function saveSession({ token, role }) {
  if (typeof token !== 'string' || !token || !['user', 'admin'].includes(role)) throw new Error('Invalid login response.');
  const admin = role === 'admin';
  localStorage.setItem(admin ? 'admin_role' : 'role', role);
  localStorage.setItem(admin ? 'admin_token' : 'token', token);
  window.dispatchEvent(new Event('auth-change'));
}
export function clearSession(admin = false, expectedToken = localStorage.getItem(admin ? 'admin_token' : 'token')) {
  const key = admin ? 'admin_token' : 'token';
  if (localStorage.getItem(key) !== expectedToken) return false;
  localStorage.removeItem(key);
  localStorage.removeItem(admin ? 'admin_role' : 'role');
  window.dispatchEvent(new Event('auth-change'));
  return true;
}
export async function apiRequest(path, { admin = false, auth = true, ...options } = {}) {
  const tokenKey = admin ? 'admin_token' : 'token';
  const token = auth ? localStorage.getItem(tokenKey) : null;
  if (auth && !token) throw Object.assign(new Error('Please log in first.'), { status: 401 });
  const response = await fetch(API_URL + path, {
    ...options,
    signal: options.signal || AbortSignal.timeout(15000),
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (auth && localStorage.getItem(tokenKey) !== token) throw Object.assign(new Error('Account changed. Please try again.'), { name: 'AbortError' });
  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearSession(admin, token);
    }
    throw Object.assign(new Error(data.message || 'Request failed (' + response.status + ').'), { status: response.status });
  }
  return data;
}
// Only an account-scoped invalidation signal is stored locally, never cart contents.
export function signalCart(userId) {
  if (!userId) return;
  window.dispatchEvent(new Event('cart-change'));
  try { localStorage.setItem('eread-cart-change:' + userId, String(Date.now()) + Math.random()); } catch {}
}
