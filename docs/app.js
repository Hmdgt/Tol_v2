// ===============================
// 🚀 APP PRINCIPAL (SPA)
// ===============================

// ---------- REGISTO SERVICE WORKER ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(
        "/Tol_v2/service-worker.js?v=2026-02-27-01"
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

// Badge (versão que carrega notificações)
window.atualizarBadge = async function () {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;
  try {
    if (typeof window.carregarNotificacoes !== 'function') {
      console.warn("carregarNotificacoes não disponível");
      return;
    }
    const notificacoes = await window.carregarNotificacoes();
    const naoLidas = notificacoes.filter(n => !n.lido).length;
    localStorage.setItem("notificacoes_naoLidas", naoLidas);
    badge.style.display = naoLidas > 0 ? "flex" : "none";
    badge.textContent = naoLidas > 99 ? "99+" : naoLidas;
  } catch (err) {
    console.error("Erro no badge", err);
  }
};

// Atualizar app (nova versão SW) - Versão melhorada com controllerchange
window.atualizarApp = async function () {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg?.waiting) {
    reg.waiting.postMessage({ action: "skipWaiting" });
    // Aguarda o novo service worker assumir o controlo antes de recarregar
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
    // 1️⃣ Guardar token antes de limpar tudo
    const token = localStorage.getItem("github_token");

    // 2️⃣ Limpar TODOS os caches
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    // 3️⃣ Remover todos os service workers ativos
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    }

    // 4️⃣ Limpar localStorage completamente
    localStorage.clear();

    // 5️⃣ Restaurar token
    if (token) {
      localStorage.setItem("github_token", token);
    }

    // 6️⃣ Forçar reload limpo (vai buscar index.html ao servidor)
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
  // Remove active de todas as views
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));

  // Ativa a view solicitada (com verificação de existência)
  const view = document.getElementById(viewId);
  if (view) view.classList.add("active");

  // Atualiza botões ativos
  document.querySelectorAll(".navBtn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.querySelector(`.navBtn[data-view="${viewId}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  // Lógica específica por view
  if (viewId === "notificacoesView") {
    if (typeof renderizarNotificacoes === "function") renderizarNotificacoes();
  }
  if (viewId === "configView") {
    const tokenInput = document.getElementById("token");
    const saved = localStorage.getItem("github_token");
    if (tokenInput && saved) tokenInput.value = saved;
  }

  // 🔥 Guardar última view no localStorage
  sessionStorage.setItem("lastView", viewId);
}

// Event listeners para os botões de navegação
document.querySelectorAll(".navBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    const viewId = btn.dataset.view;
    if (viewId) showView(viewId);
  });
});

// 🔥 Restaurar última view ao iniciar
const lastView = sessionStorage.getItem("lastView");
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

// ---------- BOTÕES DA CONFIG (usam funções globais) ----------
document.getElementById("saveTokenBtn")?.addEventListener("click", saveToken);
document.getElementById("resetAppBtn")?.addEventListener("click", resetApp);

// ---------- POLLING INTELIGENTE ----------
let pollingInterval;
async function pollBadge() {
  if (typeof window.atualizarBadge === "function") await window.atualizarBadge();
}

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollBadge();
  pollingInterval = setInterval(pollBadge, 60000);
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

// ---------- MOSTRAR BOTÃO DE ATUALIZAÇÃO (opcional) ----------
function mostrarBotaoAtualizar() {
  console.log("Nova versão disponível. Atualize a app.");
}
