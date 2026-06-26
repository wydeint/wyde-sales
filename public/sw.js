// WydEInt Super Sales — Service Worker

const CACHE = 'wyde-sales-v2'

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/'])))
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

  // Skip non-http(s) schemes (chrome-extension://, data:, etc.)
  if (!url.startsWith('http')) return

  // Always network-first for Supabase and API calls
  if (url.includes('supabase') || url.includes('/api/') || url.includes('auth')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })))
    return
  }

  // Network-first with cache fallback for everything else
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Only cache valid same-origin or CORS responses
        if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(e.request))
  )
})

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting()
})
