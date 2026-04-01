const CACHE_NAME = 'pda-system-v3';
const RUNTIME_CACHE = 'pda-runtime';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

// Install event - cache essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache).catch(err => {
        console.log('Cache addAll failed:', err);
      });
    })
  );
  self.skipWaiting();
});

// Fetch event - Network first for navigation, cache first for resources
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip socket.io requests - let them fail gracefully
  if (event.request.url.includes('socket.io')) {
    return;
  }
  
  const isNavigationRequest = event.request.mode === 'navigate';
  
  if (isNavigationRequest) {
    // For navigation requests, try network first
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
            return response;
          }
          return caches.match(event.request);
        })
        .catch(() => {
          return caches.match(event.request)
            .then(response => response || new Response('Offline - Failed to load'));
        })
    );
  } else {
    // For other requests, try cache first, then network
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          return fetch(event.request)
            .then(response => {
              if (!response || response.status !== 200 || response.type === 'error') {
                return response;
              }
              const responseToCache = response.clone();
              caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(event.request, responseToCache);
              });
              return response;
            })
            .catch(() => {
              return caches.match(event.request);
            });
        })
    );
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
