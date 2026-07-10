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

    const body = {
      message: `Upload automático: ${filename}`,
      content: base64,
      branch: CONFIG.BRANCH || "main"
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
        ToastManager.mostrar("✅ Imagem enviada com sucesso!", "sucesso");
        console.log("✔️ Upload concluído:", filename);
        // Regista a atividade
        if (typeof window.registarAtividade === 'function') {
          window.registarAtividade('upload', `Ficheiro ${filename} enviado com sucesso.`, 'sucesso');
        }
      } else {
        let err;

        try {
          err = await response.json();
        } catch {
          err = await response.text();
        }

        console.error("❌ Erro detalhado:", {
          status: response.status,
          statusText: response.statusText,
          body: err
        });

        ToastManager.mostrar(
          `❌ Upload falhou (${response.status})`,
          "erro"
        );
        // Regista a atividade
        if (typeof window.registarAtividade === 'function') {
          window.registarAtividade('upload', `Falha ao enviar ${filename}: status ${response.status}`, 'erro');
        }
      }

    } catch (e) {
      console.error("❌ Erro de rede:", e);
      ToastManager.mostrar("❌ Erro de rede.", "erro");
      // Regista a atividade
      if (typeof window.registarAtividade === 'function') {
        window.registarAtividade('upload', `Erro de rede ao enviar ${filename}.`, 'erro');
      }
    }
  };

  reader.onerror = () => {
    ToastManager.mostrar("❌ Erro ao ler ficheiro.", "erro");
    // Regista a atividade
    if (typeof window.registarAtividade === 'function') {
      window.registarAtividade('upload', 'Erro ao ler ficheiro para upload.', 'erro');
    }
  };
}

// Expor global
window.uploadToGitHub = uploadToGitHub;
