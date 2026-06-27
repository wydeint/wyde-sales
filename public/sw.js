// WydEInt Super Sales — Service Worker
// This file is intentionally minimal — content changes trigger SW update detection

const CACHE = 'wyde-sales-v4'

self.addEventListener('install', () => {
  // Skip waiting immediately so new SW activates as soon as all tabs close
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = e.request.url
  if (!url.startsWith('http')) return

  // Always network-only (no caching) for dynamic/critical resources
  if (
    url.includes('supabase') ||
    url.includes('/api/') ||
    url.includes('auth') ||
    url.endsWith('.webmanifest')
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })))
    return
  }

  // Network-first with cache fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(e.request).then(r => r || Response.error()))
  )
})

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting()
})
