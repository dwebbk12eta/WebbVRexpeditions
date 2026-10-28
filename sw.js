/**
 * Expeditions Service Worker (sw.js)
 * Enables PWA installation on Chrome, Edge, Safari, and iPadOS.
 * Serves app shell and external CDN dependencies offline without internet.
 */

const CACHE_NAME = 'expeditions-classroom-v2';

// Core application files and external vendor libraries
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './teacher.html',
  './manifest.json',
  './teacher-manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// Installation: Pre-cache core shell and libraries
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Use individual item adds with catch so a single offline failure doesn't abort install
        return Promise.allSettled(
          PRECACHE_ASSETS.map((asset) =>
            cache.add(asset).catch((err) => {
              console.warn(`[SW] Pre-cache skipped for: ${asset}`, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activation: Clean up stale cache versions from previous updates
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log(`[SW] Purging outdated cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Interceptor: Stale-While-Revalidate Strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Ignore non-HTTP/HTTPS requests (such as chrome-extension:// or file://)
  if (!request.url.startsWith('http')) {
    return;
  }

  // Bypass service worker cache for dynamic Google Apps Script API calls or WebRTC signaling
  if (
    request.url.includes('script.google.com') ||
    request.url.includes('peerjs') && request.url.includes('/id')
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // 1. If found in cache, return the cached version immediately
      if (cachedResponse) {
        // Fetch a fresh version in the background if the device is connected
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          })
          .catch(() => {
            // Quietly ignore background network errors when offline
          });

        return cachedResponse;
      }

      // 2. If not cached, fetch from network and dynamically cache if valid
      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // If offline and request is for an HTML page, fallback to cached index/teacher
          if (request.headers.get('accept')?.includes('text/html')) {
            if (request.url.includes('teacher')) {
              return caches.match('./teacher.html');
            }
            return caches.match('./index.html');
          }
        });
    })
  );
});
