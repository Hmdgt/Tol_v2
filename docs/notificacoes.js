// ===============================
// 🔧 CONFIGURAÇÃO
// ===============================
const REPO = "Hmdgt/Tol_v2";
const CAMINHO_NOTIFICACOES = "resultados/notificacoes_ativas.json";
const CAMINHO_HISTORICO = "resultados/notificacoes_historico.json";
const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO_NOTIFICACOES}`;
const GITHUB_HISTORICO_API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO_HISTORICO}`;

// ---------- FUNÇÃO AUXILIAR: string para base64 (SUPORTA UTF-8) ----------
function stringToBase64(str) {
  // Converte string UTF-8 para Uint8Array e depois para base64
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

// ---------- FUNÇÃO AUXILIAR: base64 para string (SUPORTA UTF-8) ----------
function base64ToString(base64) {
  // Converte base64 para Uint8Array e depois para string UTF-8
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// ---------- LER FICHEIRO (com suporte UTF-8) ----------
async function lerFicheiroGitHub(urlApi) {
  const token = localStorage.getItem("github_token");
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  try {
    const res = await fetch(urlApi + `?t=${Date.now()}`, { headers });
    if (!res.ok) {
      console.log(`Resposta não OK: ${res.status} para ${urlApi}`);
      return { content: [], sha: null };
    }
    
    const data = await res.json();
    
    // Usar a nova função para decodificar
    const jsonText = base64ToString(data.content);
    
    return {
      content: JSON.parse(jsonText),
      sha: data.sha
    };
  } catch (err) {
    console.error("Erro ao ler ficheiro GitHub:", err);
    return { content: [], sha: null };
  }
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

// ---------- MARCAR COMO LIDA (VERSÃO CORRIGIDA) ----------
async function marcarComoLida(idNotificacao) {
  console.log("📝 A marcar como lida:", idNotificacao);
  
  const token = localStorage.getItem("github_token");
  if (!token) {
    alert("Token não configurado.");
    return false;
  }
  
  try {
    // 1️⃣ Buscar notificações atuais
    const fAtivas = await lerFicheiroGitHub(GITHUB_API);
    console.log("📋 Notificações ativas:", fAtivas.content);
    
    const notificacao = fAtivas.content.find(n => n.id === idNotificacao);
    if (!notificacao) {
      console.log("❌ Notificação não encontrada");
      return true;
    }

    // 2️⃣ Remover das ativas
    const novasAtivas = fAtivas.content.filter(n => n.id !== idNotificacao);
    console.log("✏️ A atualizar ativas...");
    
    // Usar a nova função para codificar
    const ativasContent = JSON.stringify(novasAtivas, null, 2);
    const ativasBase64 = stringToBase64(ativasContent);
    
    const ativasResponse = await fetch(GITHUB_API, {
      method: "PUT",
      headers: { 
        Authorization: `Bearer ${token}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        message: `✅ Lida: ${idNotificacao}`,
        content: ativasBase64,
        sha: fAtivas.sha
      })
    });

    if (!ativasResponse.ok) {
      const erro = await ativasResponse.json();
      console.error("❌ Erro ao atualizar ativas:", erro);
      alert("Erro ao atualizar notificações. Tenta novamente.");
      return false;
    }
    console.log("✅ Ativas atualizadas com sucesso");

    // 3️⃣ Adicionar ao histórico
    const fHist = await lerFicheiroGitHub(GITHUB_HISTORICO_API);
    const historico = fHist.content;
    
    if (!historico.some(n => n.id === idNotificacao)) {
      notificacao.lido = true;
      notificacao.data_leitura = new Date().toISOString();
      historico.push(notificacao);
      
      console.log("📚 A atualizar histórico...");
      
      // Usar a nova função para codificar
      const histContent = JSON.stringify(historico, null, 2);
      const histBase64 = stringToBase64(histContent);
      
      const bodyHist = {
        message: `📚 Histórico: ${idNotificacao}`,
        content: histBase64
      };
      if (fHist.sha) bodyHist.sha = fHist.sha;

      const histResponse = await fetch(GITHUB_HISTORICO_API, {
        method: "PUT",
        headers: { 
          Authorization: `Bearer ${token}`, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify(bodyHist)
      });

      if (!histResponse.ok) {
        const erro = await histResponse.json();
        console.error("❌ Erro ao atualizar histórico:", erro);
        // Não falhar se o histórico falhar
      } else {
        console.log("✅ Histórico atualizado");
      }
    }

    // 4️⃣ Atualizar badge
    if (typeof window.atualizarBadge === "function") {
      await window.atualizarBadge();
    }
    
    return true;
  } catch (err) {
    console.error("❌ Erro ao marcar como lida:", err);
    alert("Erro ao marcar notificação como lida. Tenta novamente.");
    return false;
  }
}

// ---------- RENDERIZAR NOTIFICAÇÕES ----------
async function renderizarNotificacoes() {
  console.log("🔄 A renderizar notificações...");
  
  const lista = document.getElementById("notificationsList");
  if (!lista) {
    console.error("❌ Elemento notificationsList não encontrado");
    return;
  }

  lista.innerHTML = '<div class="loading">Buscando resultados...</div>';

  try {
    const notificacoes = await carregarNotificacoes();
    console.log("📬 Notificações carregadas:", notificacoes);
    
    const naoLidas = notificacoes.filter(n => !n.lido);
    console.log("🔴 Não lidas:", naoLidas.length);

    if (naoLidas.length === 0) {
      lista.innerHTML = '<div class="no-notifications">✨ Tudo limpo!</div>';
      return;
    }

    lista.innerHTML = naoLidas.map(n => `
      <div class="notification-card" data-id="${n.id}">
        <div class="notification-header">
          <ion-icon name="notifications-outline" class="jogo-icon"></ion-icon>
          <span class="jogo-nome">${n.jogo || 'Sem jogo'}</span>
          <span class="unread-badge">Nova</span>
          <span class="notification-date">${n.data ? new Date(n.data).toLocaleDateString("pt-PT") : ''}</span>
        </div>
        <div class="notification-title">${n.titulo || ''}</div>
        <div class="notification-subtitle">${n.subtitulo || ''}</div>
        <div class="notification-resumo">${n.resumo || ''}</div>
      </div>
    `).join("");

    // Adicionar event listeners
    document.querySelectorAll(".notification-card").forEach(card => {
      card.addEventListener("click", handleNotificationClick);
      card.addEventListener("touchstart", (e) => {
        e.preventDefault();
      }, { passive: false });
    });
    
  } catch (err) {
    console.error("❌ Erro ao renderizar:", err);
    lista.innerHTML = '<div class="error">Erro ao carregar notificações</div>';
  }
}

// Handler para o clique
async function handleNotificationClick(e) {
  const card = e.currentTarget;
  const id = card.dataset.id;
  
  console.log("👆 Card clicado:", id);
  
  // Feedback visual imediato
  card.style.opacity = "0.5";
  card.style.pointerEvents = "none";
  
  try {
    const sucesso = await marcarComoLida(id);
    
    if (sucesso) {
      console.log("✅ Notificação marcada, a remover card");
      
      // Animação de saída
      card.style.transition = "opacity 0.3s, transform 0.3s";
      card.style.opacity = "0";
      card.style.transform = "translateX(100%)";
      
      // Remover após animação
      setTimeout(() => {
        card.remove();
        
        const lista = document.getElementById("notificationsList");
        if (lista && document.querySelectorAll(".notification-card").length === 0) {
          lista.innerHTML = '<div class="no-notifications">✨ Tudo limpo!</div>';
        }
      }, 300);
      
    } else {
      console.log("❌ Falha ao marcar, a restaurar card");
      card.style.opacity = "1";
      card.style.pointerEvents = "auto";
    }
  } catch (err) {
    console.error("❌ Erro no handler:", err);
    card.style.opacity = "1";
    card.style.pointerEvents = "auto";
  }
}

// Expor funções globalmente
window.renderizarNotificacoes = renderizarNotificacoes;
window.marcarComoLida = marcarComoLida;
window.carregarNotificacoes = carregarNotificacoes;
