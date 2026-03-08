// ===============================
// 📤 UPLOAD DE IMAGENS
// ===============================

async function uploadToGitHub(file) {
  const token = localStorage.getItem("github_token");
  if (!token) {
    alert("Token não configurado. Vai às Configurações.");
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);

  reader.onload = async () => {
    const base64 = reader.result.split(",")[1];

    // Nome único: timestamp + sufixo aleatório para evitar colisões
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filename = `foto_${Date.now()}_${randomSuffix}.png`;
    
    // Usar configuração global (do config.js)
    const path = `${CONFIG.PASTAS.UPLOADS}${filename}`;
    const url = `https://api.github.com/repos/${CONFIG.REPO}/contents/${path}`;

    const body = {
      message: `Upload automático: ${filename}`,
      content: base64
    };

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
        console.log("✔️ Upload concluído:", filename);
        ToastManager.mostrar("✅ Imagem enviada com sucesso!", "sucesso");
      } else {
        const err = await response.json();
        console.error("❌ Erro no upload:", err);
        ToastManager.mostrar("❌ Erro no upload.", "erro");        
      }
    } catch (e) {
      console.error("❌ Erro de rede:", e);
      ToastManager.mostrar("❌ Erro de rede. Verifica a ligação.", "erro");        
    }
  };
}

// Expor função globalmente (para ser usada no app.js)
window.uploadToGitHub = uploadToGitHub;
