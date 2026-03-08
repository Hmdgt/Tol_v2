// ===============================
// 🛠️ FUNÇÕES AUXILIARES
// ===============================

// ---------- BASE64 (com suporte UTF-8) ----------
function stringToBase64(str) {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

function base64ToString(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// ---------- FORMATAÇÃO DE DATA ----------
function formatarData(dataStr) {
  if (!dataStr) return '';
  
  if (dataStr.includes('-')) {
    const partes = dataStr.split(' ')[0].split('-');
    if (partes.length === 3) {
      const [ano, mes, dia] = partes;
      return `${dia}/${mes}/${ano}`;
    }
  }
  
  return dataStr;
}

// ---------- LOADING SPINNER ----------
function showLoading(container) {
  if (typeof container === 'string') {
    container = document.getElementById(container);
  }
  if (container) {
    container.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon></div>';
  }
}

// ---------- LOGS COM TIMESTAMP (opcional) ----------
function log(msg, ...args) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`, ...args);
}

// ========== SEGURANÇA: ESCAPE HTML ==========
function escapeHTML(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ========== GESTÃO DE SCROLL (UIManager) ==========
const UIManager = {
  lockScroll() {
    document.body.classList.add('modal-open');
    // Guardar posição do scroll para restaurar depois
    this.scrollPosition = window.scrollY;
  },
  
  unlockScroll() {
    document.body.classList.remove('modal-open');
    if (this.scrollPosition !== undefined) {
      window.scrollTo(0, this.scrollPosition);
      this.scrollPosition = undefined;
    }
  },
  
  // Versão segura que garante a remoção de qualquer bloqueio
  safeUnlock() {
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
  }
};
  // ========== SISTEMA DE TOASTS ==========
const ToastManager = {
  mostrar(mensagem, tipo = 'sucesso', duracao = 3000) {
    // Remove toast anterior se existir
    const anterior = document.querySelector('.custom-toast');
    if (anterior) anterior.remove();

    // Definir cor e ícone conforme o tipo
    let bgColor, icone;
    switch (tipo) {
      case 'sucesso':
        bgColor = '#2a5a2a';
        icone = 'checkmark-circle-outline';
        break;
      case 'erro':
        bgColor = '#8b2c2c';
        icone = 'alert-circle-outline';
        break;
      case 'info':
        bgColor = '#2a4a6a';
        icone = 'information-circle-outline';
        break;
      default:
        bgColor = '#333';
        icone = 'notifications-outline';
    }

    // Criar elemento toast
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.innerHTML = `
      <ion-icon name="${icone}" style="font-size: 24px; margin-right: 8px;"></ion-icon>
      <span style="flex: 1;">${mensagem}</span>
    `;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bgColor};
      color: white;
      padding: 12px 20px;
      border-radius: 50px;
      font-size: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 250px;
      max-width: 80%;
      opacity: 0;
      transition: opacity 0.3s ease;
      border: 1px solid #555;
    `;

    document.body.appendChild(toast);

    // Forçar reflow para ativar transição
    toast.offsetHeight;
    toast.style.opacity = '1';

    // Remover após duração
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duracao);
  }
};

// Exportar para uso global (opcional, mas útil)
window.ToastManager = ToastManager;
