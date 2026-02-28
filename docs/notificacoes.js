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
  
  // Se vier no formato ISO (YYYY-MM-DD)
  if (dataStr.includes('-')) {
    const partes = dataStr.split(' ')[0].split('-');
    if (partes.length === 3) {
      const [ano, mes, dia] = partes;
      return `${dia}/${mes}/${ano}`;
    }
  }
  
  // Se já vier formatada
  return dataStr;
}

// ---------- FUNÇÃO PARA OBTER DATA DO SORTEIO ----------
function obterDataSorteio(notificacao) {
  if (!notificacao.detalhes) return formatarData(notificacao.data);
  
  const { detalhes } = notificacao;
  
  // Tentar obter do boletim
  if (detalhes.boletim && detalhes.boletim.data_sorteio) {
    return formatarData(detalhes.boletim.data_sorteio);
  }
  
  // Tentar obter do sorteio
  if (detalhes.sorteio && detalhes.sorteio.data) {
    return formatarData(detalhes.sorteio.data);
  }
  
  // Fallback para data da notificação
  return formatarData(notificacao.data);
}

// ---------- FUNÇÃO PARA OBTER NÚMERO DO CONCURSO ----------
function obterNumeroConcurso(notificacao) {
  if (!notificacao.detalhes || !notificacao.detalhes.sorteio) return '';
  
  const { sorteio, boletim } = notificacao.detalhes;
  
  // Tentar obter do sorteio
  if (sorteio.concurso) {
    return sorteio.concurso;
  }
  
  // Tentar obter do boletim
  if (boletim && boletim.concurso_sorteio) {
    return boletim.concurso_sorteio;
  }
  
  return '';
}

// ---------- FUNÇÃO PARA GERAR CONTEÚDO DO DETALHE ----------
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
  
  // Informação do Boletim
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
  
  // Informação da Aposta (diferente por jogo)
  if (detalhes.aposta) {
    html += `<div class="detalhes-secao"><h5>🎯 Aposta</h5>`;
    
    if (jogo === 'milhao' && detalhes.aposta.codigo) {
      html += `<p><strong>Código:</strong> ${detalhes.aposta.codigo}</p>`;
      if (detalhes.aposta.codigo_original) {
        html += `<p><small>Original: ${detalhes.aposta.codigo_original}</small></p>`;
      }
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
  
  // Informação do Sorteio
  if (detalhes.sorteio) {
    html += `<div class="detalhes-secao"><h5>⭐ Sorteio</h5>`;
    
    if (detalhes.sorteio.concurso) {
      html += `<p><strong>Concurso:</strong> ${detalhes.sorteio.concurso}</p>`;
    }
    
    if (jogo === 'milhao') {
      if (detalhes.sorteio.codigo_premiado) {
        html += `<p><strong>Código premiado:</strong> ${detalhes.sorteio.codigo_premiado}</p>`;
        html += `<p><strong>Prémio:</strong> ${detalhes.sorteio.premio_nome || '1.º Prémio'}</p>`;
      }
    } else {
      if (detalhes.sorteio.numeros) {
        html += `<p><strong>Números sorteados:</strong> ${detalhes.sorteio.numeros.join(' - ')}</p>`;
      }
      if (detalhes.sorteio.estrelas) {
        html += `<p><strong>Estrelas sorteadas:</strong> ${detalhes.sorteio.estrelas.join(' - ')}</p>`;
      }
      if (detalhes.sorteio.chave) {
        html += `<p><strong>Chave:</strong> ${detalhes.sorteio.chave}</p>`;
      }
    }
    
    html += `</div>`;
  }
  
  // Acertos
  if (detalhes.acertos) {
    html += `<div class="detalhes-secao"><h5>✅ Acertos</h5>`;
    html += `<p>${detalhes.acertos.descricao || resumo}</p>`;
    
    if (detalhes.acertos.numeros !== undefined) {
      html += `<p><strong>Números:</strong> ${detalhes.acertos.numeros}</p>`;
    }
    if (detalhes.acertos.estrelas !== undefined) {
      html += `<p><strong>Estrelas:</strong> ${detalhes.acertos.estrelas}</p>`;
    }
    if (detalhes.acertos.numero_da_sorte !== undefined) {
      html += `<p><strong>Nº Sorte:</strong> ${detalhes.acertos.numero_da_sorte ? 'Sim' : 'Não'}</p>`;
    }
    
    html += `</div>`;
  }
  
  // Prémio (se ganhou)
  if (detalhes.ganhou) {
    html += `
      <div class="detalhes-secao premio">
        <h5>🏆 GANHOU!</h5>
    `;
    
    if (detalhes.premio) {
      html += `
        <p><strong>${detalhes.premio.categoria || detalhes.premio.premio || 'Prémio'}</strong></p>
        <p>${detalhes.premio.descricao || ''}</p>
      `;
      
      if (detalhes.premio.valor) {
        html += `<p class="valor-premio">${detalhes.premio.valor}</p>`;
      }
      
      if (detalhes.premio.vencedores) {
        html += `<p><small>${detalhes.premio.vencedores} vencedores</small></p>`;
      }
    }
    
    if (detalhes.valor_total) {
      html += `<p class="valor-total">Total: ${detalhes.valor_total}</p>`;
    }
    
    html += `</div>`;
  } else if (detalhes.premio) {
    html += `
      <div class="detalhes-secao sem-premio">
        <h5>😕 Sem prémio</h5>
        <p>${detalhes.premio.descricao || 'Não ganhou desta vez'}</p>
      </div>
    `;
  }
  
  html += `</div>`;
  
  return html;
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

// ---------- LISTAR VALIDAÇÕES PENDENTES ----------
async function listarValidacoesPendentes() {
  try {
    if (typeof window.listarBoletinsPorValidar !== 'function') {
      return [];
    }
    
    const boletins = await window.listarBoletinsPorValidar();
    const validacoes = [];
    
    for (const [imagem, jogos] of Object.entries(boletins)) {
      validacoes.push({
        id: `valid_${imagem}`,
        tipo: 'validacao',
        titulo: `📸 ${jogos.length} boletim(ins) por validar`,
        resumo: jogos.map(j => j.tipo).join(', '),
        data: jogos[0].data_processamento,
        imagem: imagem,
        jogos: jogos,
        jogo: 'validação'
      });
    }
    
    return validacoes;
  } catch (err) {
    console.error("Erro ao listar validações:", err);
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
    if (!notificacao) {
      console.log("❌ Notificação não encontrada");
      return true;
    }

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

    if (!ativasResponse.ok) {
      const erro = await ativasResponse.json();
      console.error("❌ Erro ao atualizar ativas:", erro);
      return false;
    }

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

    if (typeof window.atualizarBadge === "function") {
      await window.atualizarBadge();
    }
    
    return true;
  } catch (err) {
    console.error("❌ Erro ao marcar como lida:", err);
    return false;
  }
}

// ---------- RENDERIZAR DETALHE DA NOTIFICAÇÃO ----------
window.renderizarDetalheNotificacao = async function(idNotificacao) {
  console.log("📄 A renderizar detalhe da notificação:", idNotificacao);
  
  const container = document.getElementById('detalheContainer');
  if (!container) return;
  
  const notificacoes = await carregarNotificacoes();
  const notificacao = notificacoes.find(n => n.id === idNotificacao);
  
  if (!notificacao) {
    container.innerHTML = '<p>Notificação não encontrada</p>';
    return;
  }
  
  container.innerHTML = `
    <div class="detalhe-header">
      <button class="btn-voltar" onclick="window.voltarParaLista()">
        <ion-icon name="arrow-back-outline"></ion-icon> Voltar
      </button>
      <h2>Detalhes</h2>
    </div>
    ${gerarConteudoDetalhes(notificacao)}
  `;
  
  // Marcar como lida em background
  marcarComoLida(idNotificacao);
};

// ---------- VOLTAR PARA A LISTA ----------
window.voltarParaLista = function() {
  console.log("⬅️ A voltar para a lista de notificações");
  
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById('notificacoesView').classList.add('active');
  renderizarNotificacoes();
};

// ---------- RENDERIZAR NOTIFICAÇÕES (LISTA MISTURADA) ----------
async function renderizarNotificacoes() {
  console.log("🔄 A renderizar notificações e validações...");
  
  const lista = document.getElementById("notificationsList");
  if (!lista) {
    console.error("❌ Elemento notificationsList não encontrado");
    return;
  }

  lista.innerHTML = '<div class="loading">Buscando resultados...</div>';

  try {
    // Carregar notificações não lidas
    const notificacoes = await carregarNotificacoes();
    const notificacoesNaoLidas = notificacoes.filter(n => !n.lido).map(n => ({
      ...n,
      tipo: 'notificacao',
      id_original: n.id,
      badge_text: 'Nova',
      badge_color: '#ff4444',
      icon: 'notifications-outline'
    }));
    
    // Carregar validações pendentes
    const validacoesPendentes = await listarValidacoesPendentes();
    const validacoesComFormato = validacoesPendentes.map(v => ({
      ...v,
      badge_text: 'Pendente',
      badge_color: '#ffaa00',
      icon: 'create-outline'
    }));
    
    // Juntar tudo e ordenar por data (mais recente primeiro)
    const todosCards = [...notificacoesNaoLidas, ...validacoesComFormato].sort((a, b) => {
      return new Date(b.data) - new Date(a.data);
    });

    if (todosCards.length === 0) {
      lista.innerHTML = '<div class="no-notifications">✨ Tudo limpo!</div>';
      return;
    }

    // Renderizar cards misturados
    lista.innerHTML = todosCards.map(card => {
      const dataFormatada = formatarData(card.data);
      
      return `
        <div class="notification-card" 
             data-id="${card.id}" 
             data-tipo="${card.tipo}"
             data-imagem="${card.imagem || ''}">
          <div class="notification-header">
            <ion-icon name="${card.icon}" class="jogo-icon"></ion-icon>
            <span class="jogo-nome">${card.jogo || card.tipo}</span>
            <span class="unread-badge" style="background: ${card.badge_color}">${card.badge_text}</span>
            <span class="notification-date">${dataFormatada}</span>
          </div>
          <div class="notification-title">${card.titulo || ''}</div>
          ${card.resumo ? `<div class="notification-resumo">${card.resumo}</div>` : ''}
        </div>
      `;
    }).join("");

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

// ---------- HANDLER PARA CLIQUE NOS CARDS ----------
async function handleNotificationClick(e) {
  const card = e.currentTarget;
  const id = card.dataset.id;
  const tipo = card.dataset.tipo;
  const imagem = card.dataset.imagem;
  
  console.log("👆 Card clicado:", { id, tipo, imagem });
  
  if (tipo === 'notificacao') {
    // Abrir view de detalhe da notificação
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById('detalheNotificacaoView').classList.add('active');
    await window.renderizarDetalheNotificacao(id);
  } else if (tipo === 'validacao') {
    // Abrir view de validação
    if (imagem && typeof window.abrirValidacao === 'function') {
      window.abrirValidacao(imagem);
    } else {
      console.error("❌ Função abrirValidacao não disponível");
    }
  }
}

// ---------- ATUALIZAR BADGE (SOMA TUDO) ----------
window.atualizarBadge = async function() {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;
  
  try {
    // Contar notificações não lidas
    const notificacoes = await carregarNotificacoes();
    const naoLidas = notificacoes.filter(n => !n.lido).length;
    
    // Contar validações pendentes
    const validacoes = await listarValidacoesPendentes();
    const totalValidacoes = validacoes.length;
    
    // Somar tudo
    const total = naoLidas + totalValidacoes;
    
    badge.style.display = total > 0 ? "flex" : "none";
    badge.textContent = total > 99 ? "99+" : total;
  } catch (err) {
    console.error("Erro ao atualizar badge:", err);
  }
};

// ---------- FECHAR MODAL (mantido para compatibilidade) ----------
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modalDetalhes');
  if (modal) {
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }
});

// Expor funções globalmente
window.renderizarNotificacoes = renderizarNotificacoes;
window.marcarComoLida = marcarComoLida;
window.carregarNotificacoes = carregarNotificacoes;
window.atualizarBadge = window.atualizarBadge;
