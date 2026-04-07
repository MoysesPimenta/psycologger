const CACHE_VERSION = "psycologger-v1";
const STATIC_ASSETS = [
  "/",
  "/offline.html",
  "/favicon.ico",
  "/_next/static/chunks/main.js",
];

// Install: cache static assets + dashboard shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(STATIC_ASSETS).then(() => self.skipWaiting());
    })
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API/portal, cache-first for static
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // API and portal routes: network-first
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/portal/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          return caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        })
        .catch(() => {
          return caches
            .match(request)
            .then((cached) => cached || caches.match("/offline.html"));
        })
    );
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) return response;
          return caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200) return response;
        return caches.open(CACHE_VERSION).then((cache) => {
          cache.put(request, response.clone());
          return response;
        });
      })
      .catch(() => caches.match(request))
  );
});
