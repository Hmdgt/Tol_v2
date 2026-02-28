const CACHE_VERSION = "v2026-02-27-01";
const CACHE_NAME = `pirika-cache-${CACHE_VERSION}`;

const ASSETS = [
  "/Tol_v2/",
  "/Tol_v2/index.html",
  "/Tol_v2/app.js",
  "/Tol_v2/upload.js",
  "/Tol_v2/notificacoes.js",
  "/Tol_v2/validacao.js",        // ← NOVO FICHEIRO ADICIONADO
  "/Tol_v2/manifest.json",
  "/Tol_v2/icons/icon-192.png",
  "/Tol_v2/icons/icon-512.png",
  "/Tol_v2/offline.html"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        ASSETS.map(url =>
          fetch(url)
            .then(resp => {
              if (resp.ok) {
                // Retornar a promessa do cache.put para garantir que termina
                return cache.put(url, resp.clone()).catch(err => {
                  console.warn(`Erro ao guardar ${url} no cache:`, err);
                });
              } else {
                console.warn(`Asset ${url} retornou status ${resp.status}`);
              }
            })
            .catch(err => console.warn("Falha ao buscar asset:", url, err))
        )
      )
    )
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Ignorar API do GitHub
  if (url.hostname === "api.github.com") {
    return;
  }

  // Network-first para navegação (HTML)
  if (req.mode === "navigate" || url.pathname.endsWith("index.html")) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          if (resp.ok) {
            // Guardar no cache sem bloquear a resposta, mas com tratamento de erro
            caches.open(CACHE_NAME)
              .then(cache => cache.put(req, resp.clone()))
              .catch(err => console.error("Erro ao guardar no cache:", err));
          }
          return resp;
        })
        .catch(async () => {
          const cachedIndex = await caches.match("/Tol_v2/index.html");
          return cachedIndex || caches.match("/Tol_v2/offline.html");
        })
    );
    return;
  }

  // Cache-first para assets
  event.respondWith(
    caches.match(req).then(resp => resp || fetch(req))
  );
});

self.addEventListener("message", event => {
  if (event.data?.action === "skipWaiting") {
    self.skipWaiting();
  }
});
