// ===============================
// 📤 UPLOAD DE IMAGENS
// ===============================

async function uploadToGitHub(file) {
  const token = localStorage.getItem("github_token");
  if (!token) {
    ToastManager.mostrar("❌ Token não configurado. Vai às Configurações.", "erro");
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);

  reader.onload = async () => {
    const base64 = reader.result.split(",")[1];
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filename = `foto_${Date.now()}_${randomSuffix}.png`;
    const path = `${CONFIG.PASTAS.UPLOADS}${filename}`;
    const url = `https://api.github.com/repos/${CONFIG.REPO}/contents/${path}`;

    const body = { message: `Upload automático: ${filename}`, content: base64 };

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        // ✅ Mostra toast igual à validação
        ToastManager.mostrar("✅ Imagem enviada com sucesso!", "sucesso");
        console.log("✔️ Upload concluído:", filename);
      } else {
        const err = await response.json();
        ToastManager.mostrar("❌ Erro ao enviar imagem.", "erro");
        console.error("❌ Erro no upload:", err);
      }
    } catch (e) {
      ToastManager.mostrar("❌ Erro de rede. Verifica a ligação.", "erro");
      console.error("❌ Erro de rede:", e);
    }
  };
}

// Expor função globalmente (para ser usada no app.js)
window.uploadToGitHub = uploadToGitHub;
