// ===============================
// 🔄 CONFIGURAÇÃO DE VERSÃO
// ===============================
const CACHE_VERSION = "v2024-02-26-03"; // muda a cada deploy
const CACHE_NAME = `pirika-cache-${CACHE_VERSION}`;

// Ficheiros offline
const ASSETS = [
  "/",
  "/index.html",
  "/config.html",
  "/notificacoes.html",
  "/manifest.json",
  "/app.js",
  "/upload.js",
  "/notificacoes.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// ===============================
// 📥 INSTALL
// ===============================
self.addEventListener("install", event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        ASSETS.map(url =>
          fetch(url)
            .then(resp => cache.put(url, resp.clone()))
            .catch(() => {})
        )
      )
    )
  );
});

// ===============================
// 🔁 ACTIVATE
// ===============================
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ===============================
// 🌐 FETCH
// ===============================
self.addEventListener("fetch", event => {
  const req = event.request;

  if (req.method !== "GET") return;

  // HTML → network first
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Outros → cache first
  event.respondWith(
    caches.match(req).then(resp => resp || fetch(req))
  );
});

// ===============================
// ⚡ SKIP WAITING (botão update)
// ===============================
self.addEventListener("message", event => {
  if (event.data?.action === "skipWaiting") {
    self.skipWaiting();
  }
});
