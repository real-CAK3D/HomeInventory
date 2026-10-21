import { useSyncExternalStore } from 'react';

const listeners = new Set();
let current = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
let direction = 1;
let depth = 0; // how many in-app pages we can go back through

function set(next, dir) {
  current = next;
  direction = dir;
  listeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    depth = Math.max(0, depth - 1);
    set(window.location.pathname + window.location.search, -1);
  });
}

export function navigate(to, { replace = false } = {}) {
  if (to === current) return;
  if (replace) window.history.replaceState({}, '', to);
  else { window.history.pushState({}, '', to); depth += 1; }
  set(to, 1);
  window.scrollTo({ top: 0 });
}

export function back(fallback = '/') {
  if (depth > 0) window.history.back();
  else navigate(fallback, { replace: true });
}

export function usePath() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => current);
}

export const navDirection = () => direction;

/** Turn a path into { name, params, query }. Old NFC links (/tag, /shelf, /box) keep working. */
export function matchRoute(path) {
  const [pathname, search = ''] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;
  if (!a) return { name: 'find', query };
  if (a === 's' || a === 'shelf') return { name: 'section', params: { number: Number(String(b).replace(/\D/g, '')), level: c ? (/^\d+$/.test(c) ? Number(c) : c) : null }, query };
  if (a === 'b' || a === 'box') return { name: 'box', params: { number: Number(String(b).replace(/\D/g, '')) }, query };
  if (a === 'i') return { name: 'item', params: { id: b }, query };
  if (a === 'tag') return { name: 'box', params: { number: Number(String(b).replace(/\D/g, '')) }, query };
  const simple = ['wall', 'add', 'recheck', 'alerts', 'me', 'tags', 'people', 'activity', 'trash', 'setup', 'labels', 'help'];
  if (simple.includes(a)) return { name: a, params: { sub: b }, query };
  return { name: 'find', query };
}
