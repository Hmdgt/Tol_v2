// ===============================
// 🔄 CONFIGURAÇÃO DE VERSÃO
// ===============================
const CACHE_VERSION = "v2024-02-26-01";   // muda a cada deploy
const CACHE_NAME = `pirika-cache-${CACHE_VERSION}`;

// Ficheiros essenciais para funcionar offline
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
// 📥 INSTALAÇÃO
// ===============================
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// ===============================
// 🔁 ATIVAÇÃO + LIMPEZA DE CACHES ANTIGOS
// ===============================
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  clients.claim();
});

// ===============================
// 🌐 FETCH COM FALLBACK AO CACHE
// ===============================
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});

// ===============================
// ⚡ RECEBER PEDIDO DE UPDATE
// ===============================
self.addEventListener("message", event => {
  if (event.data && event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});
