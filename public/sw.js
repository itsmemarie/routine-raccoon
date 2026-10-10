// Routine Raccoon service worker: lets the installed app open without a connection.
// The day lives in IndexedDB; this only caches the app shell (pages, scripts, styles, icons).
// - Page loads: network first, so a new deploy shows straight away; offline, the cached copy.
//   Pages are static (ids travel in ?query), so one copy per path is enough.
// - /_next/static/* and /icons/*: cache first (hashed or fixed files; bump CACHE when the
//   icons are regenerated).
// - Everything else, and anything cross-origin (Supabase, video embeds), is never touched.
const CACHE = "rr-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE);
  const key = url.origin + url.pathname;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    // Offline: the cached copy of this page, else Today.
    const cached = (await cache.match(key)) ?? (await cache.match(url.origin + "/"));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, url));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  }
});
