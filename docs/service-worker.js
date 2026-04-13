// ===============================
// 📦 SERVICE WORKER
// ===============================

// Importar configuração (cuidado: importScripts é síncrono)
importScripts('config.js');

const CACHE_VERSION = CONFIG.CACHE_VERSION;
const CACHE_NAME = `pirika-cache-${CACHE_VERSION}`;

const ASSETS = [
  "/Tol_v2/",
  "/Tol_v2/index.html",
  "/Tol_v2/config.js",
  "/Tol_v2/utils.js",
  "/Tol_v2/app.js",
  "/Tol_v2/upload.js",
  "/Tol_v2/notificacoes.js",
  "/Tol_v2/validacao.js",
  "/Tol_v2/manifest.json",
  "/Tol_v2/icons/icon-192.png",
  "/Tol_v2/icons/icon-512.png",
  "/Tol_v2/offline.html"
];

self.addEventListener("install", event => {
  console.log(`[SW] Instalando versão ${CACHE_VERSION}`);
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("[SW] A guardar assets em cache...");
      return Promise.all(
        ASSETS.map(url =>
          fetch(url)
            .then(resp => {
              if (resp.ok) {
                return cache.put(url, resp.clone()).catch(err => {
                  console.warn(`[SW] Erro ao guardar ${url} no cache:`, err);
                });
              } else {
                console.warn(`[SW] Asset ${url} retornou status ${resp.status}`);
              }
            })
            .catch(err => console.warn(`[SW] Falha ao buscar asset: ${url}`, err))
        )
      );
    }).then(() => console.log("[SW] Instalação completa!"))
  );
});

self.addEventListener("activate", event => {
  console.log(`[SW] Ativando versão ${CACHE_VERSION}`);
  
  event.waitUntil(
    caches.keys()
      .then(keys => {
        const toDelete = keys.filter(key => key !== CACHE_NAME);
        console.log(`[SW] A limpar ${toDelete.length} caches antigos...`);
        
        return Promise.all(
          toDelete.map(key => {
            console.log(`[SW] A apagar cache antigo: ${key}`);
            return caches.delete(key);
          })
        );
      })
      .then(() => {
        console.log("[SW] Activação completa, a tomar controlo...");
        return self.clients.claim();
      })
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

  // Estratégia para imagens (stale-while-revalidate)
  if (url.pathname.includes('/Tol_v2/uploads/') || 
      url.pathname.includes('/Tol_v2/thumbnails/')) {
    
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(req).then(cached => {
          const fetchPromise = fetch(req)
            .then(networkResp => {
              if (networkResp.ok) {
                cache.put(req, networkResp.clone());
              }
              return networkResp;
            })
            .catch(() => cached);
          
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Network-first para navegação (HTML)
  if (req.mode === "navigate" || url.pathname.endsWith("index.html")) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          if (resp.ok) {
            const respClone = resp.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(req, respClone))
              .catch(err => console.error("[SW] Erro ao guardar no cache:", err));
          }
          return resp;
        })
        .catch(async () => {
          console.log("[SW] Rede falhou, a usar cache para:", req.url);
          const cachedIndex = await caches.match("/Tol_v2/index.html");
          return cachedIndex || caches.match("/Tol_v2/offline.html");
        })
    );
    return;
  }

  // Cache-first para assets estáticos
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // Atualizar em background (stale-while-revalidate)
        fetch(req)
          .then(resp => {
            if (resp.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(req, resp));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(req);
    })
  );
});

self.addEventListener("message", event => {
  const { action } = event.data || {};
  
  switch(action) {
    case "skipWaiting":
      console.log("[SW] A executar skipWaiting...");
      self.skipWaiting();
      break;
      
    case "clearCache":
      console.log("[SW] A limpar todo o cache...");
      event.waitUntil(
        caches.keys().then(keys => {
          return Promise.all(keys.map(key => caches.delete(key)));
        })
      );
      break;
  }
});

// ===============================
// 🔔 RECEBER PUSH (Web Push API)
// ===============================
self.addEventListener("push", event => {
  console.log("[SW] Push recebida!");
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {}

  const title = data.title || "Notificação";
  const options = {
    body: data.body || "",
    icon: data.icon || "/Tol_v2/icons/icon-192.png",
    badge: data.badge || "/Tol_v2/icons/icon-192.png",
    data: data,
    tag: data.tag || "default",
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ===============================
// 🔔 CLIQUE NA NOTIFICAÇÃO
// ===============================
self.addEventListener("notificationclick", event => {
  console.log("[SW] Notificação clicada:", event.notification);
  
  event.notification.close();
  
  const data = event.notification.data || {};
  const urlToOpen = data.url || "/Tol_v2/";
  
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(windowClients => {
        for (let client of windowClients) {
          if (client.url.includes(urlToOpen) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

console.log(`[SW] Service Worker carregado (${CACHE_VERSION})`);
