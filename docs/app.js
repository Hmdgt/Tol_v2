// ===============================
// 🚀 APP PRINCIPAL (SPA)
// ===============================

// ========== ATUALIZAR BARRA DE ESTADO CONFORME TEMA ==========
function fixThemeColor() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const color = theme === 'light' ? '#ffffff' : '#000000';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
}
fixThemeColor();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') fixThemeColor();
});
window.addEventListener('scroll', fixThemeColor, { passive: true });

// ========== FORÇAR COR DA BARRA DE NAVEGAÇÃO NO ANDROID (RESPEITA TEMA) ==========
function forceNavigationBarColor() {
  if (/Android/.test(navigator.userAgent)) {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const bgColor = theme === 'light' ? '#ffffff' : '#000000';
    
    // Remove estilos inline anteriores para não conflituar com o CSS
    document.documentElement.style.removeProperty('background-color');
    document.body.style.removeProperty('background-color');
    
    // Atualizar meta theme-color (única função necessária)
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = bgColor;
    
    console.log(`✅ theme-color definido para ${bgColor} no Android`);
  }
}

// Chamar inicialmente e sempre que o tema mudar
forceNavigationBarColor();

// Ouvir mudanças de tema (disparado pelo theme.js)
window.addEventListener('themeChanged', () => {
  forceNavigationBarColor();
});

let appEmPrimeiroPlano = true;
window.isAppEmPrimeiroPlano = () => appEmPrimeiroPlano;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    appEmPrimeiroPlano = true;
    
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge();
      console.log("🧹 Badge do ícone limpo (app aberta)");
    }
    
    forceNavigationBarColor();
    startPolling();
  } else {
    appEmPrimeiroPlano = false;
    clearInterval(pollingInterval);
  }
});

// ========== CAPTURA DE ERROS PARA DEBUG ==========
window.errorLog = [];

window.addEventListener('error', (event) => {
  const errorMsg = `${event.message} (${event.filename}:${event.lineno})`;
  window.errorLog.push({
    timestamp: new Date().toLocaleString(),
    message: errorMsg,
    stack: event.error?.stack
  });
  if (window.errorLog.length > 20) window.errorLog.shift();
});

window.addEventListener('unhandledrejection', (event) => {
  window.errorLog.push({
    timestamp: new Date().toLocaleString(),
    message: `Promise rejection: ${event.reason}`,
    stack: event.reason?.stack
  });
  if (window.errorLog.length > 20) window.errorLog.shift();
});

function mostrarLogs() {
  const logs = window.errorLog || [];
  if (logs.length === 0) {
    alert("Nenhum erro registado até agora.");
    return;
  }

  let msg = "📋 Últimos erros:\n\n";
  logs.slice().reverse().forEach((log, i) => {
    msg += `${i+1}. ${log.timestamp}\n${log.message}\n\n`;
  });

  const modal = document.getElementById('modalDetalhes');
  const modalBody = document.getElementById('modalBody');
  if (modal && modalBody) {
    modalBody.innerHTML = `<pre style="white-space: pre-wrap; color: #ff8888; background:#111; padding:10px; border-radius:8px; max-height:400px; overflow-y:auto;">${escapeHTML(msg)}</pre>`;
    modal.style.display = 'flex';
  } else {
    alert(msg);
  }
}

// ========== GESTOR DE VIEWS ==========
window.ViewManager = {
  goTo(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');

    document.querySelectorAll('.navBtn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.navBtn[data-view="${viewId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (viewId === 'notificacoesView' && typeof window.renderizarNotificacoes === 'function') {
      window.renderizarNotificacoes();
    }
    if (viewId === 'validacaoView' && typeof window.renderizarListaValidacao === 'function') {
      window.renderizarListaValidacao();
    }
    if (viewId === 'estatisticasView' && typeof window.renderizarEstatisticas === 'function') {
      window.renderizarEstatisticas();
    }
    if (viewId === 'configView') {
      const tokenInput = document.getElementById('token');
      const saved = localStorage.getItem('github_token');
      if (tokenInput && saved) tokenInput.value = saved;
    }

    sessionStorage.setItem('lastView', viewId);
  }
};

document.querySelectorAll('.navBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    const viewId = btn.dataset.view;
    if (viewId) window.ViewManager.goTo(viewId);
  });
});

// ---------- REGISTO SERVICE WORKER ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(
        `/Tol_v2/service-worker.js?v=${CONFIG.CACHE_VERSION}`
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
      // Aguarda um pouco para garantir que o SW foi removido
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    localStorage.clear();
    if (token) localStorage.setItem("github_token", token);
    sessionStorage.clear();   // limpa também a última view guardada
    // Força reload sem cache
    window.location.href = "/Tol_v2/index.html?reset=" + Date.now();
  } catch (err) {
    console.error("Erro ao fazer reset:", err);
    alert("Erro ao atualizar a aplicação. Tenta novamente.");
  }
};

window.saveToken = function () {
  const tokenInput = document.getElementById("token");
  if (!tokenInput) return;
  const token = tokenInput.value.trim();
  if (!token) return alert("Introduz um token válido.");
  localStorage.setItem("github_token", token);
  alert("Token guardado.");
};

// ---------- EVENTOS CÂMARA/GALERIA ----------
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

document.getElementById("saveTokenBtn")?.addEventListener("click", window.saveToken);
document.getElementById("resetAppBtn")?.addEventListener("click", window.resetApp);

// ---------- POLLING INTELIGENTE ----------
let pollingInterval;
async function pollBadge() {
  if (typeof window.atualizarBadge === "function") {
    await window.atualizarBadge();
  }
}

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollBadge();
  pollingInterval = setInterval(pollBadge, 60000);
}

if (document.visibilityState === "visible") {
  startPolling();
}

function mostrarBotaoAtualizar() {
  console.log("Nova versão disponível. Atualize a app.");
}

document.addEventListener('DOMContentLoaded', () => {
  // Força a reavaliação da view ativa (caso o sessionStorage tenha sido limpo)
  const lastView = sessionStorage.getItem('lastView');
  if (lastView && document.getElementById(lastView)) {
    ViewManager.goTo(lastView);
  } else {
    ViewManager.goTo('homeView');
  }
  
  const btn = document.getElementById('debugLogsBtn');
  if (btn) btn.addEventListener('click', mostrarLogs);
});
