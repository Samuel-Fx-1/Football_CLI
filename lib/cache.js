// Tiny in-process cache. The archived pages never change, so a long TTL is
// safe and keeps the Wayback Machine from being hit repeatedly.
const store = new Map();
const MAX_ENTRIES = 250;

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlMs = 30 * 60 * 1000) {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function cacheClear() {
  store.clear();
}
