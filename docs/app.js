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

    // ✅ Renovação de subscrição push (com throttle de 1 hora)
    if (typeof verificarComThrottle === 'function') {
      verificarComThrottle();
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

// ========== SISTEMA DE LOG DE ATIVIDADES ==========
window.activityLog = [];

// Função para registar atividade
window.registarAtividade = function(tipo, mensagem, resultado) {
  const atividade = {
    timestamp: new Date().toLocaleString('pt-PT'),
    tipo: tipo,
    mensagem: mensagem,
    resultado: resultado // 'sucesso' ou 'erro'
  };
  
  window.activityLog.push(atividade);
  
  // Manter apenas os 20 mais recentes
  if (window.activityLog.length > 20) {
    window.activityLog.shift();
  }
  
  console.log(`[${atividade.resultado.toUpperCase()}] ${atividade.tipo}: ${atividade.mensagem}`);
};

// Função para renderizar o log de atividades
function renderizarLogAtividades() {
  const container = document.getElementById('debugLogsView');
  if (!container) return;
  
  const logs = window.activityLog || [];
  
  if (logs.length === 0) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; padding: 20px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
          <button class="btn-voltar" id="btnVoltarLogs" style="display: inline-flex; align-items: center; gap: 4px;">
            <ion-icon name="arrow-back-outline"></ion-icon> Voltar
          </button>
        </div>
        <div class="no-notifications">Nenhuma atividade registada até agora.</div>
      </div>
    `;
  } else {
    // Ordenar em descendente (mais recente primeiro)
    const logsOrdenados = logs.slice().reverse();
    
    let html = `
      <div style="display: flex; flex-direction: column; height: 100%; padding: 20px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
          <button class="btn-voltar" id="btnVoltarLogs" style="display: inline-flex; align-items: center; gap: 4px;">
            <ion-icon name="arrow-back-outline"></ion-icon> Voltar
          </button>
          <h3 style="flex: 1; margin: 0; text-align: center; color: var(--text-primary);">📋 Histórico de Atividades</h3>
        </div>
        
        <div style="flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;">
    `;
    
    logsOrdenados.forEach((log) => {
      const iconSucesso = log.resultado === 'sucesso' ? '✅' : '❌';
      const corResultado = log.resultado === 'sucesso' ? 'var(--positive)' : 'var(--negative)';
      
      html += `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="color: ${corResultado}; font-weight: bold;">${iconSucesso}</span>
            <span style="color: var(--text-secondary); font-size: 12px; font-weight: bold; text-transform: uppercase;">${escapeHTML(log.tipo)}</span>
            <span style="color: var(--text-secondary); font-size: 11px; margin-left: auto;">${escapeHTML(log.timestamp)}</span>
          </div>
          <div style="color: var(--text-primary); font-size: 13px; line-height: 1.4;">${escapeHTML(log.mensagem)}</div>
        </div>
      `;
    });
    
    html += `
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }
  
  const btnVoltar = document.getElementById('btnVoltarLogs');
  if (btnVoltar) {
    btnVoltar.addEventListener('click', () => {
      window.ViewManager.goTo('configView');
    });
  }
}

function mostrarLogs() {
  window.ViewManager.goTo('debugLogsView');
  renderizarLogAtividades();
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

// ========== GESTÃO DO BOTÃO "VOLTAR" NATIVO (ANDROID / PWA) ==========
let ultimoBackPress = 0;
const TEMPO_DUPLO_CLICK = 2000;

function handleBackPress() {
  const modal = document.getElementById('modalDetalhes');
  const modalVisivel = modal && window.getComputedStyle(modal).display !== 'none';
  const activeView = document.querySelector('.view.active')?.id;

  // 1. Fechar modal se estiver aberto
  if (modalVisivel) {
    modal.style.display = 'none';
    return;
  }

  // 2. Logs de atividades → voltar a configurações
  if (activeView === 'debugLogsView') {
    window.ViewManager.goTo('configView');
    return;
  }

  // 3. Navegação interna: detalhe → origem
  if (activeView === 'detalheNotificacaoView') {
    const destino = window.detalheOrigem || 'apostasView';
    window.ViewManager.goTo(destino);
    if (destino === 'apostasView' && typeof window.carregarApostasView === 'function') {
      window.carregarApostasView();
    } else if (destino === 'notificacoesView' && typeof window.renderizarNotificacoes === 'function') {
      window.renderizarNotificacoes();
    }
    return;
  }

  // 4. Validação → voltar à lista
  if (activeView === 'validacaoView') {
    if (typeof window.voltarListaValidacao === 'function') {
      window.voltarListaValidacao();
    }
    return;
  }

  // 5. Qualquer outra view → voltar para a home
  if (activeView !== 'homeView') {
    window.ViewManager.goTo('homeView');
    return;
  }

  // 6. Já está na HOME: double back to exit
  const agora = Date.now();
  if (agora - ultimoBackPress < TEMPO_DUPLO_CLICK) {
    // Segunda pressão → fecha a app
    try {
      window.close();
    } catch (e) {
      // Fallback silencioso
    }
  } else {
    ultimoBackPress = agora;
    if (typeof ToastManager !== 'undefined') {
      ToastManager.mostrar("Pressione novamente para sair", "info", 2000);
    }
  }
}

// Inicializa o histórico APENAS UMA VEZ (no load)
window.addEventListener('load', () => {
  history.pushState({ app: true }, '', location.href);
});

// Listener do botão voltar do sistema
window.addEventListener('popstate', (event) => {
  handleBackPress();
});

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

  // ✅ Verificação de subscrição push no arranque (imediata)
  if (typeof verificarERenovarSubscricao === 'function') {
    verificarERenovarSubscricao();
  }
});
