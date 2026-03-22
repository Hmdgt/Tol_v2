// ===============================
// 🚀 APP PRINCIPAL (SPA)
// ===============================

// ========== GARANTIR COR PRETA DA BARRA DE ESTADO ==========
function fixThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#000000');
}
fixThemeColor();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') fixThemeColor();
});
window.addEventListener('scroll', fixThemeColor, { passive: true });

// ========== FORÇAR NAVIGATION BAR PRETA NO ANDROID ==========
function forceBlackNavigationBar() {
  if (/Android/.test(navigator.userAgent)) {
    // Forçar cor de fundo do documento
    document.documentElement.style.backgroundColor = '#000000';
    document.body.style.backgroundColor = '#000000';
    
    // Recriar meta tag theme-color para forçar refresh no Android
    const oldMeta = document.querySelector('meta[name="theme-color"]');
    if (oldMeta) oldMeta.remove();
    
    const newMeta = document.createElement('meta');
    newMeta.name = 'theme-color';
    newMeta.content = '#000000';
    document.head.appendChild(newMeta);
    
    // Forçar também no CSS
    const style = document.createElement('style');
    style.textContent = `
      html, body {
        background-color: #000000 !important;
      }
    `;
    document.head.appendChild(style);
    
    console.log('✅ Navigation bar forçada a preto no Android');
  }
}

// Chamar quando a app inicia
forceBlackNavigationBar();

// ✅ NOVO: Variável para saber se app está em primeiro plano
let appEmPrimeiroPlano = true;

// ✅ NOVO: Função para outros scripts consultarem
window.isAppEmPrimeiroPlano = () => appEmPrimeiroPlano;

// Chamar quando a app volta a ficar visível
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    appEmPrimeiroPlano = true;
    
    // ✅ NOVO: Limpar badge do ícone quando app abre
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge();
      console.log("🧹 Badge do ícone limpo (app aberta)");
    }
    
    forceBlackNavigationBar();
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
    // Esconder todas as views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    // Mostrar a nova
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');

    // Atualizar botões da navegação
    document.querySelectorAll('.navBtn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.navBtn[data-view="${viewId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Executar funções específicas de cada view
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

    // Guardar última view
    sessionStorage.setItem('lastView', viewId);
  }
};

// Substituir a navegação manual pelo ViewManager
document.querySelectorAll('.navBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    const viewId = btn.dataset.view;
    if (viewId) window.ViewManager.goTo(viewId);
  });
});

// Restaurar última view ao iniciar
const lastView = sessionStorage.getItem('lastView');
if (lastView && document.getElementById(lastView)) {
  window.ViewManager.goTo(lastView);
} else {
  window.ViewManager.goTo('homeView');
}

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
    if (token) localStorage.setItem("github_token", token);

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
document.getElementById("saveTokenBtn")?.addEventListener("click", window.saveToken);
document.getElementById("resetAppBtn")?.addEventListener("click", window.resetApp);

// ---------- POLLING INTELIGENTE ----------
let pollingInterval;
async function pollBadge() {
  // Chamar atualizarBadge (que já inclui verificação de push)
  if (typeof window.atualizarBadge === "function") {
    await window.atualizarBadge();
  }
}

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollBadge();
  pollingInterval = setInterval(pollBadge, 60000);
}

// ✅ NOTA: O event listener visibilitychange já foi atualizado acima
// com a lógica de appEmPrimeiroPlano e limpeza do badge

if (document.visibilityState === "visible") {
  startPolling();
}

// ---------- MOSTRAR BOTÃO DE ATUALIZAÇÃO (opcional) ----------
function mostrarBotaoAtualizar() {
  console.log("Nova versão disponível. Atualize a app.");
}

// Ligar o botão de debug depois de a página carregar
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('debugLogsBtn');
  if (btn) btn.addEventListener('click', mostrarLogs);
});
