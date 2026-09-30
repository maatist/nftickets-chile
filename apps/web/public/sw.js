// Lightweight, hand-rolled service worker for PWA installability and a basic
// offline shell. Kept intentionally simple: it precaches the app shell and
// serves cached responses when the network is unavailable. The gate scanner's
// offline verification/queueing (Task 10) builds on top of this baseline.

const CACHE_NAME = "nftickets-shell-v1";
const APP_SHELL = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Network-first for navigations, falling back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/").then((r) => r || Response.error()),
      ),
    );
    return;
  }

  // Cache-first for other GET requests.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
