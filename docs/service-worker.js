// ===============================
// 📦 SERVICE WORKER COM SUPORTE PUSH
// ===============================

// Importar configuração
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
  "/Tol_v2/estatisticas.js",
  "/Tol_v2/manifest.json",
  "/Tol_v2/icons/icon-192.png",
  "/Tol_v2/icons/icon-512.png",
  "/Tol_v2/offline.html"
];

// Firebase Config (mesma do index.html)
const firebaseConfig = {
  apiKey: "AIzaSyAcUc1wu97-3d7kn1TdZp7eOXfT0BAJKHM",
  authDomain: "apostasnotificacoes-9d332.firebaseapp.com",
  projectId: "apostasnotificacoes-9d332",
  storageBucket: "apostasnotificacoes-9d332.firebasestorage.app",
  messagingSenderId: "739974685994",
  appId: "1:739974685994:web:bae50bb7a45d84730a2a53"
};

// Importar Firebase (versão compatível com service worker)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ========== INSTALAÇÃO ==========
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

// ========== ATIVAÇÃO ==========
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

// ========== FETCH (CACHE ESTRATÉGIA) ==========
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

// ========== NOTIFICAÇÕES PUSH (FCM) ==========
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Notificação em background:', payload);
  
  const notificationTitle = payload.notification?.title || "Nova notificação";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: '/Tol_v2/icons/icon-192.png',
    badge: '/Tol_v2/icons/icon-192.png',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: true
  };
  
  // Mostrar notificação nativa
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// ========== CLIQUE NA NOTIFICAÇÃO ==========
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notificação clicada:', event.notification);
  
  event.notification.close();
  
  // Abrir a app quando clicar na notificação
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Se já existe uma janela aberta, foca nela
        for (let client of windowClients) {
          if (client.url.includes('/Tol_v2/') && 'focus' in client) {
            return client.focus();
          }
        }
        // Caso contrário, abre uma nova
        if (clients.openWindow) {
          return clients.openWindow('/Tol_v2/index.html');
        }
      })
  );
});

// ========== MENSAGENS DO CLIENTE ==========
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

console.log(`[SW] Service Worker carregado (${CACHE_VERSION}) com suporte push`);
