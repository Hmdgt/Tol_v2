// ===============================
// 🚀 APP PRINCIPAL (SPA)
// ===============================

// ---------- REGISTO SERVICE WORKER ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(
        "/Tol_v2/service-worker.js?v=2026-02-28"
      );
      console.log("SW registado", reg);
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            mostrarBotaoAtualizar();
          }
        });
      });
    } catch (err) {
      console.error("Erro ao registar SW", err);
    }
  });
}

// ---------- FUNÇÕES GLOBAIS ----------

// Badge melhorado com cache local
window.atualizarBadge = async function (forceRefresh = false) {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;
  
  try {
    let naoLidas;
    
    // Se for forceRefresh ou não houver cache, buscar da API
    if (forceRefresh) {
      if (typeof window.carregarNotificacoes !== 'function') {
        console.warn("carregarNotificacoes não disponível");
        return;
      }
      const notificacoes = await window.carregarNotificacoes();
      naoLidas = notificacoes.filter(n => !n.lido).length;
      localStorage.setItem("notificacoes_naoLidas", naoLidas);
    } else {
      // Usar valor do cache local primeiro (mais rápido)
      naoLidas = parseInt(localStorage.getItem("notificacoes_naoLidas") || "0");
    }
    
    // Atualizar badge
    badge.style.display = naoLidas > 0 ? "flex" : "none";
    badge.textContent = naoLidas > 99 ? "99+" : naoLidas;
    
    // Se não for forceRefresh, atualizar em background
    if (!forceRefresh && typeof window.carregarNotificacoes === 'function') {
      setTimeout(async () => {
        try {
          const notificacoes = await window.carregarNotificacoes();
          const novasNaoLidas = notificacoes.filter(n => !n.lido).length;
          localStorage.setItem("notificacoes_naoLidas", novasNaoLidas);
          badge.style.display = novasNaoLidas > 0 ? "flex" : "none";
          badge.textContent = novasNaoLidas > 99 ? "99+" : novasNaoLidas;
        } catch (e) {
          console.warn("Erro ao atualizar badge em background:", e);
        }
      }, 100);
    }
    
  } catch (err) {
    console.error("Erro no badge", err);
  }
};

// Atualizar app (nova versão SW)
window.atualizarApp = async function () {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg?.waiting) {
    reg.waiting.postMessage({ action: "skipWaiting" });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    }, { once: true });
  } else {
    window.location.reload();
  }
};

// Reset app (hard reset: limpa caches, remove SW, mantém token)
window.resetApp = async function () {
  try {
    const token = localStorage.getItem("github_token");

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    }

    localStorage.clear();

    if (token) {
      localStorage.setItem("github_token", token);
    }

    window.location.href = "/Tol_v2/index.html";

  } catch (err) {
    console.error("Erro ao fazer reset:", err);
    alert("Erro ao atualizar a aplicação. Tenta novamente.");
  }
};

// Guardar token
window.saveToken = function () {
  const tokenInput = document.getElementById("token");
  if (!tokenInput) return;
  const token = tokenInput.value.trim();
  if (!token) return alert("Introduz um token válido.");
  localStorage.setItem("github_token", token);
  alert("Token guardado.");
};

// ---------- ROUTER (navegação por views) ----------
function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));

  const view = document.getElementById(viewId);
  if (view) view.classList.add("active");

  document.querySelectorAll(".navBtn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.querySelector(`.navBtn[data-view="${viewId}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  if (viewId === "notificacoesView") {
    if (typeof renderizarNotificacoes === "function") renderizarNotificacoes();
    // Forçar atualização do badge quando abre notificações
    if (typeof window.atualizarBadge === "function") window.atualizarBadge(true);
  }
  if (viewId === "configView") {
    const tokenInput = document.getElementById("token");
    const saved = localStorage.getItem("github_token");
    if (tokenInput && saved) tokenInput.value = saved;
  }

  localStorage.setItem("lastView", viewId);
}

// Event listeners para os botões de navegação
document.querySelectorAll(".navBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    const viewId = btn.dataset.view;
    if (viewId) showView(viewId);
  });
});

// Restaurar última view ao iniciar
const lastView = localStorage.getItem("lastView");
if (lastView && document.getElementById(lastView)) {
  showView(lastView);
} else {
  showView("homeView");
}

// ---------- EVENTOS CÂMARA/GALERIA (delegação) ----------
document.body.addEventListener("click", (e) => {
  const btn = e.target.closest("#cameraButton, #galleryButton");
  if (!btn) return;

  if (btn.id === "cameraButton") {
    document.getElementById("cameraInput")?.click();
  } else if (btn.id === "galleryButton") {
    document.getElementById("galleryInput")?.click();
  }
});

document.body.addEventListener("change", (e) => {
  if (e.target.id === "cameraInput" || e.target.id === "galleryInput") {
    const file = e.target.files[0];
    if (file && typeof uploadToGitHub === "function") {
      uploadToGitHub(file);
    }
  }
});

// ---------- BOTÕES DA CONFIG ----------
document.getElementById("saveTokenBtn")?.addEventListener("click", saveToken);
document.getElementById("resetAppBtn")?.addEventListener("click", resetApp);

// ---------- POLLING INTELIGENTE ----------
let pollingInterval;
let pollCount = 0;

async function pollBadge() {
  pollCount++;
  // A cada 3 polls, forçar refresh da API
  const forceRefresh = (pollCount % 3 === 0);
  if (typeof window.atualizarBadge === "function") {
    await window.atualizarBadge(forceRefresh);
  }
}

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollBadge();
  pollingInterval = setInterval(pollBadge, 30000); // 30 segundos
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startPolling();
  } else {
    clearInterval(pollingInterval);
  }
});

if (document.visibilityState === "visible") {
  startPolling();
}

// Mostrar botão de atualização
function mostrarBotaoAtualizar() {
  console.log("Nova versão disponível. Atualize a app.");
}
