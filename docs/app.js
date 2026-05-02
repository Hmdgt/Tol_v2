// ===============================
// 🚀 APP PRINCIPAL (SPA)
// ===============================

// ========== RECUPERAÇÃO DE LAYOUT APÓS RESET ==========
function forceLayoutRecovery() {
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    
    document.documentElement.style.willChange = 'transform';
    document.body.style.willChange = 'transform';
    void document.body.offsetHeight; // força reflow
    
    setTimeout(() => {
      document.documentElement.style.willChange = 'auto';
      document.body.style.willChange = 'auto';
    }, 0);
    
    if (window.location.search.includes('reset')) {
      const url = new URL(window.location);
      url.searchParams.delete('reset');
      window.history.replaceState(null, '', url.toString());
    }
  });
}

window.addEventListener('load', () => {
  setTimeout(forceLayoutRecovery, 100);
});

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

function forceNavigationBarColor() {
  if (/Android/.test(navigator.userAgent)) {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const bgColor = theme === 'light' ? '#ffffff' : '#000000';
    
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

forceNavigationBarColor();

window.addEventListener('themeChanged', () => {
  forceNavigationBarColor();
});

let appEmPrimeiroPlano = true;
window.isAppEmPrimeiroPlano = () => appEmPrimeiroPlano;

// ========== GESTÃO DE VISIBILIDADE (melhorada) ==========
document.addEventListener('visibilitychange', () => {
  const isVisible = document.visibilityState === 'visible';
  
  if (isVisible) {
    appEmPrimeiroPlano = true;
    console.log("📱 App passou para PRIMEIRO PLANO");
    
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge();
      console.log("🧹 Badge do ícone limpo (app aberta)");
    }
    
    forceNavigationBarColor();
    startPolling();
    
    // Atualizar badge imediatamente ao voltar
    if (typeof window.atualizarBadge === "function") {
      window.atualizarBadge();
    }
  } else {
    appEmPrimeiroPlano = false;
    console.log("📱 App passou para SEGUNDO PLANO (minimizada)");
    
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }
});

// ========== CAPTURA DE ERROS ==========
window.errorLog = [];

window.addEventListener('error', (event) => {
  const errorMsg = `${event.message} (${event.filename}:${event.lineno})`;
  window.errorLog.push({
    timestamp: new Date().toLocaleString(),
    message: errorMsg,
    stack: event.error?.stack
  });
  if (window.errorLog.length > 20) window.errorLog.shift();
  console.error("❌ Erro capturado:", errorMsg);
});

window.addEventListener('unhandledrejection', (event) => {
  window.errorLog.push({
    timestamp: new Date().toLocaleString(),
    message: `Promise rejection: ${event.reason}`,
    stack: event.reason?.stack
  });
  if (window.errorLog.length > 20) window.errorLog.shift();
  console.error("❌ Promise rejection capturada:", event.reason);
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

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"]/g, function(c) {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return c;
  });
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
    if (viewId === 'apostasView' && typeof window.carregarApostasView === 'function') {
      window.carregarApostasView();
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

// ---------- REGISTO SERVICE WORKER (melhorado) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(
        `/Tol_v2/service-worker.js?v=${CONFIG.CACHE_VERSION}`
      );
      console.log("✅ SW registado com sucesso:", reg);
      
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        console.log("🔄 Nova versão do SW encontrada");
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            console.log("📦 Nova versão pronta a instalar");
            mostrarBotaoAtualizar();
          }
        });
      });
    } catch (err) {
      console.error("❌ Erro ao registar SW:", err);
    }
  });
}

// ---------- FUNÇÕES GLOBAIS ----------
window.atualizarApp = async function () {
  console.log("🔄 A atualizar aplicação...");
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
  console.log("🔄 A resetar aplicação...");
  try {
    const token = localStorage.getItem("github_token");
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      console.log("🗑️ Cache limpo");
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
      await new Promise(resolve => setTimeout(resolve, 300));
      console.log("🗑️ Service Workers desregistados");
    }
    localStorage.clear();
    if (token) localStorage.setItem("github_token", token);
    sessionStorage.clear();
    
    window.location.replace("/Tol_v2/index.html?reset=" + Date.now());
  } catch (err) {
    console.error("❌ Erro ao fazer reset:", err);
    alert("Erro ao atualizar a aplicação. Tenta novamente.");
  }
};

window.saveToken = function () {
  const tokenInput = document.getElementById("token");
  if (!tokenInput) return;
  const token = tokenInput.value.trim();
  if (!token) return alert("Introduz um token válido.");
  localStorage.setItem("github_token", token);
  console.log("✅ Token guardado");
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

// ---------- POLLING (mantido para quando app está aberta) ----------
let pollingInterval = null;

async function pollBadge() {
  if (typeof window.atualizarBadge === "function") {
    console.log("🔄 Polling: a atualizar badge...");
    await window.atualizarBadge();
  }
}

function startPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  pollBadge();
  pollingInterval = setInterval(pollBadge, 60000);
  console.log("✅ Polling iniciado (60s)");
}

// Iniciar polling apenas se app estiver visível
if (document.visibilityState === "visible") {
  startPolling();
}

function mostrarBotaoAtualizar() {
  console.log("🔄 Nova versão disponível. Recarrega a app.");
}

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', () => {
  console.log("🚀 App inicializada");
  
  const lastView = sessionStorage.getItem('lastView');
  if (lastView && document.getElementById(lastView)) {
    ViewManager.goTo(lastView);
  } else {
    ViewManager.goTo('homeView');
  }
  
  const btn = document.getElementById('debugLogsBtn');
  if (btn) btn.addEventListener('click', mostrarLogs);
  
  if (typeof window.atualizarBadge === "function") {
    setTimeout(() => window.atualizarBadge(), 500);
  }
});
