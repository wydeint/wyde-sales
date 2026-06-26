// WydEInt Super Sales — Service Worker
// Handles caching + update notification (no auto-update)

const CACHE = 'wyde-sales-v2'
const PRECACHE = ['/', '/dashboard']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => {
      // Don't skipWaiting — wait for user to tap "อัปเดต"
    })
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = e.request.url
  // Always network-first for Supabase, API, and auth
  if (url.includes('supabase') || url.includes('/api/') || url.includes('auth')) {
    e.respondWith(fetch(e.request))
    return
  }
  // Network-first with cache fallback for pages
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request))
  )
})

// User taps "อัปเดตเดี๋ยวนี้" → skip waiting → controller change → reload
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting()
})
