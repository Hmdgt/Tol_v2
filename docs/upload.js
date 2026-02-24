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

    const filename = `foto_${Date.now()}.png`;
    const repo = "Hmdgt/Tol_v2";
    const path = `uploads/${filename}`;

    const url = `https://api.github.com/repos/${repo}/contents/${path}`;

    const body = {
      message: `Upload automático: ${filename}`,
      content: base64
    };

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      document.getElementById("status").innerText = "✔️ Upload concluído!";
    } else {
      const err = await response.json();
      document.getElementById("status").innerText = "❌ Erro no upload: " + JSON.stringify(err);
    }
  };
}
