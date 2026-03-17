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

// Chamar quando a app volta a ficar visível
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    forceBlackNavigationBar();
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

// Função para mostrar logs num modal (podes manter, mas não há botão na UI)
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

    // Atualizar botões da navegação (apenas se a view tiver um botão correspondente)
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
    if (viewId === 'tokenEditView') {
      // Ao abrir a view de edição, carregar o token atual no input
      const tokenInput = document.getElementById('tokenInput');
      const saved = localStorage.getItem('github_token');
      if (tokenInput) tokenInput.value = saved || '';
    }

    // Guardar última view (excepto se for a tokenEditView, que é temporária)
    if (viewId !== 'tokenEditView') {
      sessionStorage.setItem('lastView', viewId);
    }
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
if (lastView && document.getElementById(lastView) && lastView !== 'tokenEditView') {
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

// Guardar token (chamado pelo botão na tokenEditView)
window.saveToken = function () {
  const tokenInput = document.getElementById("tokenInput");
  if (!tokenInput) return;
  const token = tokenInput.value.trim();
  if (!token) {
    ToastManager.mostrar("❌ Introduz um token válido.", "erro");
    return;
  }
  localStorage.setItem("github_token", token);
  ToastManager.mostrar("✅ Token guardado com sucesso!", "sucesso");
  // Voltar para a view de configurações
  window.ViewManager.goTo('configView');
};

// Abrir a view de edição do token (chamado pelo botão na configView)
window.openTokenEdit = function () {
  window.ViewManager.goTo('tokenEditView');
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

// ---------- BOTÕES DA CONFIG (após DOM carregado) ----------
document.addEventListener('DOMContentLoaded', () => {
  // Botão "Guardar Token" na configView abre a tokenEditView
  const editTokenBtn = document.getElementById('editTokenBtn');
  if (editTokenBtn) {
    editTokenBtn.addEventListener('click', window.openTokenEdit);
  }

  // Botão "Atualizar App" na configView
  const resetAppBtn = document.getElementById('resetAppBtn');
  if (resetAppBtn) {
    resetAppBtn.addEventListener('click', window.resetApp);
  }

  // Botão "Gravar Token" na tokenEditView
  const saveTokenBtn = document.getElementById('saveTokenBtn');
  if (saveTokenBtn) {
    saveTokenBtn.addEventListener('click', window.saveToken);
  }

  // Botão "Voltar" na tokenEditView
  const backToConfigBtn = document.getElementById('backToConfigBtn');
  if (backToConfigBtn) {
    backToConfigBtn.addEventListener('click', () => {
      window.ViewManager.goTo('configView');
    });
  }

  // Nota: o botão "debugLogsBtn" foi removido, por isso não há listener.
});

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
  // Se quiseres, podes implementar um toast ou snackbar aqui
}
