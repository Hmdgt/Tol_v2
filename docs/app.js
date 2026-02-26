// ===============================
// 🚀 DOM READY
// ===============================
document.addEventListener("DOMContentLoaded", async () => {

  // 🔔 Atualizar badge se existir
  if (window.atualizarBadge) {
    await window.atualizarBadge();
  }

  // 📷 Botão câmara
  const cameraBtn = document.getElementById("cameraButton");
  const cameraInput = document.getElementById("cameraInput");

  if (cameraBtn && cameraInput) {
    cameraBtn.addEventListener("click", () => cameraInput.click());

    cameraInput.addEventListener("change", () => {
      const file = cameraInput.files[0];
      if (file) uploadToGitHub(file);
    });
  }

  // 🖼️ Botão galeria
  const galleryBtn = document.getElementById("galleryButton");
  const galleryInput = document.getElementById("galleryInput");

  if (galleryBtn && galleryInput) {
    galleryBtn.addEventListener("click", () => galleryInput.click());

    galleryInput.addEventListener("change", () => {
      const file = galleryInput.files[0];
      if (file) uploadToGitHub(file);
    });
  }

  // 📦 Registar Service Worker
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register(
        "/service-worker.js?v=2024-02-26-03"
      );

      console.log("SW registado", reg);

      // 🔄 Detectar nova versão
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            mostrarBotaoAtualizar();
          }
        });
      });

    } catch (err) {
      console.error("Erro ao registar SW", err);
    }
  }
});

// ===============================
// 🔔 FUNÇÃO BADGE (DEFINE AQUI)
// ===============================
async function atualizarBadge() {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;

  try {
    // 👉 Aqui vais buscar o número real de notificações
    // Exemplo: guardado no localStorage
    const count = parseInt(localStorage.getItem("notificacoes") || "0");

    if (count > 0) {
      badge.style.display = "flex";
      badge.textContent = count;
    } else {
      badge.style.display = "none";
    }
  } catch (err) {
    console.error("Erro ao atualizar badge", err);
  }
}

// ===============================
// 🔄 BOTÃO ATUALIZAR APP
// ===============================
function mostrarBotaoAtualizar() {
  const btn = document.getElementById("btnUpdate");
  if (btn) btn.style.display = "block";
}

async function atualizarApp() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;

  if (reg.waiting) {
    reg.waiting.postMessage({ action: "skipWaiting" });
  }

  window.location.reload();
}

// ===============================
// 🧹 RESET APP (limpar cache, MANTER tokens)
// ===============================
async function resetApp() {
  // 🔐 Guardar token antes de limpar
  const token = localStorage.getItem("github_token");

  // 🧹 Limpar caches
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }

  // 🧹 Limpar localStorage
  localStorage.clear();

  // 🔐 Restaurar token
  if (token) {
    localStorage.setItem("github_token", token);
  }

  // 🔄 Desregistar SW
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) {
    await reg.unregister();
  }

  window.location.reload();
}

// ===============================
// 🌍 DISPONIBILIZAR GLOBALMENTE
// ===============================
window.atualizarBadge = atualizarBadge;
window.atualizarApp = atualizarApp;
window.resetApp = resetApp;
