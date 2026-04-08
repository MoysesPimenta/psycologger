const CACHE_VERSION = "psycologger-v2";
// Only precache assets we know exist. Next.js chunk filenames are hashed
// and /favicon.ico is not present — cache.addAll() is all-or-nothing and
// a single 404 aborts the whole install.
const STATIC_ASSETS = [
  "/",
  "/offline.html",
];

// Install: best-effort precache — never fail the install on a missing asset
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            // Swallow individual failures so one 404 doesn't poison the batch
            console.warn("[sw] precache skip", url, err?.message);
          })
        )
      );
      return self.skipWaiting();
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
