// public/sw.js - Service worker that makes AptiPrep installable and usable offline.
// Bump CACHE_VERSION whenever the app shell list changes.
const CACHE_VERSION = 'v2';
const SHELL_CACHE = `aptiprep-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `aptiprep-runtime-${CACHE_VERSION}`;

// Paths are relative to the service worker scope so this works on localhost
// and on a GitHub Pages sub-path (e.g. /Apti-practice/).
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './js/utils/dom.js',
  './js/utils/event-router.js',
  './js/utils/chapter-order.js',
  './js/services/session.service.js',
  './js/services/storage.service.js',
  './js/services/scoring.service.js',
  './js/services/mock-generator.service.js',
  './js/utils/pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Third-party assets the UI depends on (Tailwind CDN + Google Fonts).
const CDN_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.all(APP_SHELL.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('aptiprep-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isCacheable(response) {
  return response && (response.ok || response.type === 'opaque');
}

// Network first, fall back to cache (keeps HTML/JS fresh while still working offline).
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = (await caches.match(request)) ||
      (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = (await caches.match('./index.html')) || (await caches.match('./'));
      if (shell) return shell;
    }
    throw err;
  }
}

// Serve from cache immediately, refresh in the background (large question banks, fonts, CDN).
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const update = fetch(request)
    .then((response) => {
      if (isCacheable(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  const fresh = await update;
  if (fresh) return fresh;
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache the local Express API or Google Apps Script sync calls.
  if (url.origin === self.location.origin && url.pathname.includes('/api/')) return;
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, event));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Question data changes with every fix: always fetch it fresh, fall back to cache offline.
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.includes('/data/') || url.pathname.includes('/icons/')) {
    event.respondWith(staleWhileRevalidate(request, event));
    return;
  }

  event.respondWith(networkFirst(request));
});
