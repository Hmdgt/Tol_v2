// ===============================
// 🔄 CONFIGURAÇÃO DE VERSÃO
// ===============================
const CACHE_VERSION = "v2024-02-27-01"; // muda a cada deploy
const CACHE_NAME = `pirika-cache-${CACHE_VERSION}`;

// Ficheiros offline
const ASSETS = [
  "/Tol_v2/",
  "/Tol_v2/index.html",
  "/Tol_v2/config.html",
  "/Tol_v2/notificacoes.html",
  "/Tol_v2/manifest.json",
  "/Tol_v2/app.js",
  "/Tol_v2/upload.js",
  "/Tol_v2/notificacoes.js",
  "/Tol_v2/icons/icon-192.png",
  "/Tol_v2/icons/icon-512.png"
  // Se ainda quiser o GIF, adicione com o caminho correto
  // "/Tol_v2/loto_logo_animado.gif"
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

  // 🔥 CORREÇÃO CRÍTICA:
  // Forçar network-first para index.html SEMPRE
  if (req.url.endsWith("index.html") || req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(resp => {
          caches.open(CACHE_NAME).then(cache => cache.put(req, resp.clone()));
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
