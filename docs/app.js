// Adicionar no início do app.js
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar notificações ao iniciar
    if (window.atualizarBadge) {
        await window.atualizarBadge();
    }
});

// Botão da câmara → abre a câmara
document.getElementById("cameraButton").addEventListener("click", () => {
  document.getElementById("cameraInput").click();
});

// Quando a foto é tirada → upload automático
document.getElementById("cameraInput").addEventListener("change", () => {
  const file = document.getElementById("cameraInput").files[0];
  if (file) uploadToGitHub(file);
});

// Botão da galeria → abre a galeria
document.getElementById("galleryButton").addEventListener("click", () => {
  document.getElementById("galleryInput").click();
});

// Quando escolhe imagem da galeria → upload automático
document.getElementById("galleryInput").addEventListener("change", () => {
  const file = document.getElementById("galleryInput").files[0];
  if (file) uploadToGitHub(file);
});

// Tornar funções globais para outros scripts
window.atualizarBadge = atualizarBadge;
