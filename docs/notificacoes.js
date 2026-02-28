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
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

// ---------- FUNÇÃO AUXILIAR: base64 para string (SUPORTA UTF-8) ----------
function base64ToString(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// ---------- FUNÇÃO PARA FORMATAR DATA ----------
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

// ---------- FUNÇÃO PARA OBTER DATA DO SORTEIO ----------
function obterDataSorteio(notificacao) {
  if (!notificacao.detalhes) return formatarData(notificacao.data);
  const { detalhes } = notificacao;
  if (detalhes.boletim && detalhes.boletim.data_sorteio) {
    return formatarData(detalhes.boletim.data_sorteio);
  }
  if (detalhes.sorteio && detalhes.sorteio.data) {
    return formatarData(detalhes.sorteio.data);
  }
  return formatarData(notificacao.data);
}

// ---------- FUNÇÃO PARA OBTER NÚMERO DO CONCURSO ----------
function obterNumeroConcurso(notificacao) {
  if (!notificacao.detalhes || !notificacao.detalhes.sorteio) return '';
  const { sorteio, boletim } = notificacao.detalhes;
  if (sorteio.concurso) return sorteio.concurso;
  if (boletim && boletim.concurso_sorteio) return boletim.concurso_sorteio;
  return '';
}

// ---------- FUNÇÃO PARA GERAR CONTEÚDO DO MODAL ----------
function gerarConteudoDetalhes(notificacao) {
  const { jogo, titulo, resumo, detalhes } = notificacao;
  
  if (!detalhes) {
    return `<p>Sem detalhes disponíveis</p>`;
  }
  
  let html = `
    <div class="detalhes-jogo ${jogo}">
      <h4>${titulo}</h4>
      <div class="detalhes-resultado">${resumo}</div>
  `;
  
  if (detalhes.boletim) {
    html += `
      <div class="detalhes-secao">
        <h5>📋 Boletim</h5>
        <p><strong>Referência:</strong> ${detalhes.boletim.referencia || 'N/A'}</p>
        <p><strong>Data do sorteio:</strong> ${formatarData(detalhes.boletim.data_sorteio) || 'N/A'}</p>
        ${detalhes.boletim.concurso_sorteio ? `<p><strong>Concurso:</strong> ${detalhes.boletim.concurso_sorteio}</p>` : ''}
      </div>
    `;
  }
  
  if (detalhes.aposta) {
    html += `<div class="detalhes-secao"><h5>🎯 Aposta</h5>`;
    if (jogo === 'milhao' && detalhes.aposta.codigo) {
      html += `<p><strong>Código:</strong> ${detalhes.aposta.codigo}</p>`;
    } else {
      if (detalhes.aposta.numeros) {
        html += `<p><strong>Números:</strong> ${detalhes.aposta.numeros.join(' - ')}</p>`;
      }
      if (detalhes.aposta.estrelas) {
        html += `<p><strong>Estrelas:</strong> ${detalhes.aposta.estrelas.join(' - ')}</p>`;
      }
      if (detalhes.aposta.numero_da_sorte) {
        html += `<p><strong>Nº da Sorte:</strong> ${detalhes.aposta.numero_da_sorte}</p>`;
      }
    }
    html += `</div>`;
  }
  
  if (detalhes.sorteio) {
    html += `<div class="detalhes-secao"><h5>⭐ Sorteio</h5>`;
    if (detalhes.sorteio.concurso) {
      html += `<p><strong>Concurso:</strong> ${detalhes.sorteio.concurso}</p>`;
    }
    if (jogo === 'milhao') {
      if (detalhes.sorteio.codigo_premiado) {
        html += `<p><strong>Código premiado:</strong> ${detalhes.sorteio.codigo_premiado}</p>`;
      }
    } else {
      if (detalhes.sorteio.numeros) {
        html += `<p><strong>Números sorteados:</strong> ${detalhes.sorteio.numeros.join(' - ')}</p>`;
      }
      if (detalhes.sorteio.estrelas) {
        html += `<p><strong>Estrelas sorteadas:</strong> ${detalhes.sorteio.estrelas.join(' - ')}</p>`;
      }
    }
    html += `</div>`;
  }
  
  if (detalhes.acertos) {
    html += `<div class="detalhes-secao"><h5>✅ Acertos</h5>`;
    html += `<p>${detalhes.acertos.descricao || resumo}</p>`;
    html += `</div>`;
  }
  
  if (detalhes.ganhou) {
    html += `
      <div class="detalhes-secao premio">
        <h5>🏆 GANHOU!</h5>
        <p class="valor-premio">${detalhes.premio?.valor || 'Prémio'}</p>
      </div>
    `;
  }
  
  html += `</div>`;
  return html;
}

// ---------- LER FICHEIRO ----------
async function lerFicheiroGitHub(urlApi) {
  const token = localStorage.getItem("github_token");
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  try {
    const res = await fetch(urlApi + `?t=${Date.now()}`, { headers });
    if (!res.ok) return { content: [], sha: null };
    const data = await res.json();
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

// ---------- MARCAR COMO LIDA ----------
async function marcarComoLida(idNotificacao) {
  console.log("📝 A marcar como lida:", idNotificacao);
  
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

    if (!ativasResponse.ok) return false;

    const fHist = await lerFicheiroGitHub(GITHUB_HISTORICO_API);
    const historico = fHist.content;
    
    if (!historico.some(n => n.id === idNotificacao)) {
      notificacao.lido = true;
      notificacao.data_leitura = new Date().toISOString();
      historico.push(notificacao);
      
      const histContent = JSON.stringify(historico, null, 2);
      const histBase64 = stringToBase64(histContent);
      
      const bodyHist = {
        message: `📚 Histórico: ${idNotificacao}`,
        content: histBase64
      };
      if (fHist.sha) bodyHist.sha = fHist.sha;

      await fetch(GITHUB_HISTORICO_API, {
        method: "PUT",
        headers: { 
          Authorization: `Bearer ${token}`, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify(bodyHist)
      });
    }

    // Atualizar badge sem bloquear
    if (typeof window.atualizarBadge === "function") {
      window.atualizarBadge(true).catch(console.warn);
    }
    
    return true;
  } catch (err) {
    console.error("❌ Erro ao marcar como lida:", err);
    return false;
  }
}

// ---------- RENDERIZAR NOTIFICAÇÕES ----------
async function renderizarNotificacoes() {
  console.log("🔄 A renderizar notificações...");
  
  const lista = document.getElementById("notificationsList");
  if (!lista) return;

  lista.innerHTML = '<div class="loading">Buscando resultados...</div>';

  try {
    const notificacoes = await carregarNotificacoes();
    const naoLidas = notificacoes.filter(n => !n.lido);

    if (naoLidas.length === 0) {
      lista.innerHTML = '<div class="no-notifications">✨ Tudo limpo!</div>';
      return;
    }

    lista.innerHTML = naoLidas.map(n => {
      const dataSorteio = obterDataSorteio(n);
      const numeroConcurso = obterNumeroConcurso(n);
      
      return `
        <div class="notification-card" data-id="${n.id}">
          <div class="notification-header">
            <ion-icon name="notifications-outline" class="jogo-icon"></ion-icon>
            <span class="jogo-nome">${n.jogo || 'Sem jogo'}</span>
            <span class="unread-badge">Nova</span>
            <span class="notification-date">${dataSorteio}</span>
          </div>
          <div class="notification-title">${n.titulo || ''}</div>
          ${numeroConcurso ? `<div class="notification-concurso">📅 ${numeroConcurso}</div>` : ''}
          <div class="notification-resumo">${n.resumo || ''}</div>
        </div>
      `;
    }).join("");

    document.querySelectorAll(".notification-card").forEach(card => {
      card.addEventListener("click", handleNotificationClick);
      card.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
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
  
  try {
    const notificacoes = await carregarNotificacoes();
    const notificacao = notificacoes.find(n => n.id === id);
    if (!notificacao) return;
    
    const modal = document.getElementById('modalDetalhes');
    const modalBody = document.getElementById('modalBody');
    
    if (modal && modalBody) {
      modalBody.innerHTML = gerarConteudoDetalhes(notificacao);
      modal.style.display = 'flex';
      
      // Marcar como lida e atualizar badge
      marcarComoLida(id).then(sucesso => {
        if (sucesso) {
          console.log("✅ Marcada como lida em background");
          if (document.getElementById('notificacoesView').classList.contains('active')) {
            renderizarNotificacoes();
          }
        }
      });
    }
    
  } catch (err) {
    console.error("❌ Erro ao abrir modal:", err);
  }
}

// Fechar modal
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modalDetalhes');
  if (modal) {
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn?.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }
});

// Expor funções globalmente
window.renderizarNotificacoes = renderizarNotificacoes;
window.marcarComoLida = marcarComoLida;
window.carregarNotificacoes = carregarNotificacoes;
