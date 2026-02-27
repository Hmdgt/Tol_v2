// ===============================
// 🔧 CONFIGURAÇÃO
// ===============================
const REPO = "Hmdgt/Tol_v2";
const CAMINHO_NOTIFICACOES = "resultados/notificacoes_ativas.json";
const CAMINHO_HISTORICO = "resultados/notificacoes_historico.json";
const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO_NOTIFICACOES}`;
const GITHUB_HISTORICO_API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO_HISTORICO}`;

// ---------- LER FICHEIRO ----------
async function lerFicheiroGitHub(urlApi) {
  const token = localStorage.getItem("github_token");
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(urlApi + `?t=${Date.now()}`, { headers });
  if (!res.ok) return { content: [], sha: null };
  const data = await res.json();
  return { content: JSON.parse(atob(data.content)), sha: data.sha };
}

// ---------- CARREGAR NOTIFICAÇÕES ----------
async function carregarNotificacoes() {
  try {
    const { content } = await lerFicheiroGitHub(GITHUB_API);
    return content;
  } catch (err) {
    console.error("Erro ao carregar notificações:", err);
    return [];
  }
}

// ---------- MARCAR COMO LIDA ----------
async function marcarComoLida(idNotificacao) {
  const token = localStorage.getItem("github_token");
  if (!token) {
    alert("Token não configurado.");
    return false;
  }
  try {
    const fAtivas = await lerFicheiroGitHub(GITHUB_API);
    const notificacao = fAtivas.content.find(n => n.id === idNotificacao);
    if (!notificacao) return true;

    const novasAtivas = fAtivas.content.filter(n => n.id !== idNotificacao);
    await fetch(GITHUB_API, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `✅ Lida: ${idNotificacao}`,
        content: btoa(JSON.stringify(novasAtivas, null, 2)),
        sha: fAtivas.sha
      })
    });

    const fHist = await lerFicheiroGitHub(GITHUB_HISTORICO_API);
    const historico = fHist.content;
    if (!historico.some(n => n.id === idNotificacao)) {
      notificacao.lido = true;
      notificacao.data_leitura = new Date().toISOString();
      historico.push(notificacao);

      // 🔧 Construir corpo do pedido sem enviar sha se for null (criação)
      const bodyHist = {
        message: `📚 Histórico: ${idNotificacao}`,
        content: btoa(JSON.stringify(historico, null, 2))
      };
      if (fHist.sha) bodyHist.sha = fHist.sha; // só inclui se existir

      await fetch(GITHUB_HISTORICO_API, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(bodyHist)
      });
    }

    if (typeof window.atualizarBadge === "function") await window.atualizarBadge();
    return true;
  } catch (err) {
    console.error("Erro ao marcar como lida:", err);
    return false;
  }
}

// ---------- RENDERIZAR NOTIFICAÇÕES ----------
async function renderizarNotificacoes() {
  const lista = document.getElementById("notificationsList");
  if (!lista) return;

  lista.innerHTML = '<div class="loading">Buscando resultados...</div>';

  const notificacoes = await carregarNotificacoes();
  const naoLidas = notificacoes.filter(n => !n.lido);

  if (naoLidas.length === 0) {
    lista.innerHTML = '<div class="no-notifications">✨ Tudo limpo!</div>';
    return;
  }

  lista.innerHTML = naoLidas.map(n => `
    <div class="notification-card" data-id="${n.id}">
      <div class="notification-header">
        <ion-icon name="notifications-outline" class="jogo-icon"></ion-icon>
        <span class="jogo-nome">${n.jogo}</span>
        <span class="unread-badge">Nova</span>
        <span class="notification-date">${new Date(n.data).toLocaleDateString("pt-PT")}</span>
      </div>
      <div class="notification-title">${n.titulo}</div>
      <div class="notification-subtitle">${n.subtitulo}</div>
      <div class="notification-resumo">${n.resumo}</div>
    </div>
  `).join("");

  document.querySelectorAll(".notification-card").forEach(card => {
    card.addEventListener("click", async () => {
      const id = card.dataset.id;
      card.style.opacity = "0.5";
      card.style.pointerEvents = "none";

      if (await marcarComoLida(id)) {
        card.remove();
        if (document.querySelectorAll(".notification-card").length === 0) {
          lista.innerHTML = '<div class="no-notifications">✨ Tudo limpo!</div>';
        }
      } else {
        card.style.opacity = "1";
        card.style.pointerEvents = "auto";
      }
    });
  });
}

// Expor funções globalmente
window.renderizarNotificacoes = renderizarNotificacoes;
window.marcarComoLida = marcarComoLida;
window.carregarNotificacoes = carregarNotificacoes;
