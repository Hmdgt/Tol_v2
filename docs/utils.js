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
