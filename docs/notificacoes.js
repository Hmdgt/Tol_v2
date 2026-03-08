// ===============================
// 🔔 NOTIFICAÇÕES
// ===============================

// Usar configuração global (do config.js)
const GITHUB_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.NOTIFICACOES}`;
const GITHUB_HISTORICO_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.HISTORICO}`;

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

// ---------- FUNÇÃO PARA GERAR CONTEÚDO DO DETALHE (COM ESCAPE HTML) ----------
function gerarConteudoDetalhes(notificacao) {
  const { jogo, titulo, resumo, detalhes } = notificacao;
  
  if (!detalhes) {
    return `<p>Sem detalhes disponíveis</p>`;
  }
  
  // Aplicar escape em todos os campos dinâmicos
  const tituloEscaped = escapeHTML(titulo);
  const resumoEscaped = escapeHTML(resumo);
  const jogoEscaped = escapeHTML(jogo);
  
  let html = `
    <div class="detalhes-jogo ${jogoEscaped}">
      <h4>${tituloEscaped}</h4>
      <div class="detalhes-resultado">${resumoEscaped}</div>
  `;
  
  // Informação do Boletim
  if (detalhes.boletim) {
    const boletim = detalhes.boletim;
    html += `
      <div class="detalhes-secao">
        <h5>📋 Boletim</h5>
        <p><strong>Referência:</strong> ${escapeHTML(boletim.referencia || 'N/A')}</p>
        <p><strong>Data do sorteio:</strong> ${escapeHTML(formatarData(boletim.data_sorteio) || 'N/A')}</p>
        ${boletim.concurso_sorteio ? `<p><strong>Concurso:</strong> ${escapeHTML(boletim.concurso_sorteio)}</p>` : ''}
      </div>
    `;
  }
  
  // Informação da Aposta (diferente por jogo)
  if (detalhes.aposta) {
    const aposta = detalhes.aposta;
    html += `<div class="detalhes-secao"><h5>🎯 Aposta</h5>`;
    
    if (jogo === 'milhao' && aposta.codigo) {
      html += `<p><strong>Código:</strong> ${escapeHTML(aposta.codigo)}</p>`;
      if (aposta.codigo_original) {
        html += `<p><small>Original: ${escapeHTML(aposta.codigo_original)}</small></p>`;
      }
    } else {
      if (aposta.numeros) {
        const numerosStr = aposta.numeros.map(n => escapeHTML(n)).join(' - ');
        html += `<p><strong>Números:</strong> ${numerosStr}</p>`;
      }
      if (aposta.estrelas) {
        const estrelasStr = aposta.estrelas.map(e => escapeHTML(e)).join(' - ');
        html += `<p><strong>Estrelas:</strong> ${estrelasStr}</p>`;
      }
      if (aposta.numero_da_sorte) {
        html += `<p><strong>Nº da Sorte:</strong> ${escapeHTML(aposta.numero_da_sorte)}</p>`;
      }
      // 🆕 Adicionar Dream Number para EuroDreams
      if (aposta.dream_number) {
          html += `<p><strong>Dream Number:</strong> ${escapeHTML(aposta.dream_number)}</p>`;
      }
    }
    
    html += `</div>`;
  }
  
  // Informação do Sorteio
  if (detalhes.sorteio) {
    const sorteio = detalhes.sorteio;
    html += `<div class="detalhes-secao"><h5>⭐ Sorteio</h5>`;
    
    if (sorteio.concurso) {
      html += `<p><strong>Concurso:</strong> ${escapeHTML(sorteio.concurso)}</p>`;
    }
    
    if (jogo === 'milhao') {
      if (sorteio.codigo_premiado) {
        html += `<p><strong>Código premiado:</strong> ${escapeHTML(sorteio.codigo_premiado)}</p>`;
        html += `<p><strong>Prémio:</strong> ${escapeHTML(sorteio.premio_nome || '1.º Prémio')}</p>`;
      }
    } else {
      if (sorteio.numeros) {
        const nums = sorteio.numeros.map(n => escapeHTML(n)).join(' - ');
        html += `<p><strong>Números sorteados:</strong> ${nums}</p>`;
      }
      if (sorteio.estrelas) {
        const estrs = sorteio.estrelas.map(e => escapeHTML(e)).join(' - ');
        html += `<p><strong>Estrelas sorteadas:</strong> ${estrs}</p>`;
      }
      if (sorteio.chave) {
        html += `<p><strong>Chave:</strong> ${escapeHTML(sorteio.chave)}</p>`;
      }
    }
    
    html += `</div>`;
  }
  
  // Acertos
  if (detalhes.acertos) {
    const acertos = detalhes.acertos;
    html += `<div class="detalhes-secao"><h5>✅ Acertos</h5>`;
    html += `<p>${escapeHTML(acertos.descricao || resumo)}</p>`;
    
    if (acertos.numeros !== undefined) {
      html += `<p><strong>Números:</strong> ${escapeHTML(acertos.numeros)}</p>`;
    }
    if (acertos.estrelas !== undefined) {
      html += `<p><strong>Estrelas:</strong> ${escapeHTML(acertos.estrelas)}</p>`;
    }
    if (acertos.numero_da_sorte !== undefined) {
      html += `<p><strong>Nº Sorte:</strong> ${acertos.numero_da_sorte ? 'Sim' : 'Não'}</p>`;
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
      const premio = detalhes.premio;
      html += `
        <p><strong>${escapeHTML(premio.categoria || premio.premio || 'Prémio')}</strong></p>
        <p>${escapeHTML(premio.descricao || '')}</p>
      `;
      
      if (premio.valor) {
        html += `<p class="valor-premio">${escapeHTML(premio.valor)}</p>`;
      }
      
      if (premio.vencedores) {
        html += `<p><small>${escapeHTML(premio.vencedores)} vencedores</small></p>`;
      }
    }
    
    if (detalhes.valor_total) {
      html += `<p class="valor-total">Total: ${escapeHTML(detalhes.valor_total)}</p>`;
    }
    
    html += `</div>`;
  } else if (detalhes.premio) {
    html += `
      <div class="detalhes-secao sem-premio">
        <h5>😕 Sem prémio</h5>
        <p>${escapeHTML(detalhes.premio.descricao || 'Não ganhou desta vez')}</p>
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
  const token = localStorage.getItem("github_token");
  if (!token) {
    alert("Token não configurado.");
    return false;
  }
  
  try {
    const fAtivas = await lerFicheiroGitHub(GITHUB_API);
    const notificacao = fAtivas.content.find(n => n.id === idNotificacao);
    if (!notificacao) {
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
  // Usar ViewManager se disponível, senão fallback
  if (window.ViewManager) {
    window.ViewManager.goTo('notificacoesView');
  } else {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById('notificacoesView').classList.add('active');
  }
  renderizarNotificacoes();
};

// ---------- RENDERIZAR NOTIFICAÇÕES (LISTA MISTURADA) ----------
async function renderizarNotificacoes() {
  const lista = document.getElementById("notificationsList");
  if (!lista) {
    console.error("❌ Elemento notificationsList não encontrado");
    return;
  }

  lista.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon></div>';

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
      lista.innerHTML = '<div class="no-notifications">Sem notificaçoes!</div>';
      return;
    }

    // Renderizar cards misturados (com escape nos campos)
    lista.innerHTML = todosCards.map(card => {
      const dataFormatada = formatarData(card.data);
      const jogoNome = escapeHTML(card.jogo || card.tipo);
      const titulo = escapeHTML(card.titulo || '');
      const resumo = card.resumo ? escapeHTML(card.resumo) : '';
      
      return `
        <div class="notification-card" 
             data-id="${escapeHTML(card.id)}" 
             data-tipo="${escapeHTML(card.tipo)}"
             data-imagem="${escapeHTML(card.imagem || '')}">
          <div class="notification-header">
            <ion-icon name="${escapeHTML(card.icon)}" class="jogo-icon"></ion-icon>
            <span class="jogo-nome">${jogoNome}</span>
            <span class="unread-badge" style="background: ${escapeHTML(card.badge_color)}">${escapeHTML(card.badge_text)}</span>
            <span class="notification-date">${escapeHTML(dataFormatada)}</span>
          </div>
          <div class="notification-title">${titulo}</div>
          ${resumo ? `<div class="notification-resumo">${resumo}</div>` : ''}
        </div>
      `;
    }).join("");

    // Adicionar event listeners (removidos os touchstart com preventDefault)
    document.querySelectorAll(".notification-card").forEach(card => {
      card.addEventListener("click", handleNotificationClick);
      // NOTA: removido o event listener touchstart que bloqueava o scroll
    });
    
  } catch (err) {
    console.error("❌ Erro ao renderizar:", err);
    lista.innerHTML = '<div class="error">Erro ao carregar notificações</div>';
  }
}

// ---------- HANDLER PARA CLIQUE NOS CARDS (COM FEEDBACK E PREVENÇÃO DE MÚLTIPLOS CLIQUES) ----------
let clicking = false;

async function handleNotificationClick(e) {
  if (clicking) {
    console.log("⏳ Clique ignorado (já em processamento)");
    return;
  }
  
  const card = e.currentTarget;
  const id = card.dataset.id;
  const tipo = card.dataset.tipo;
  const imagem = card.dataset.imagem;
  
  // Feedback visual imediato
  clicking = true;
  card.style.opacity = '0.5';
  card.style.pointerEvents = 'none';
  
  try {
    if (tipo === 'notificacao') {
      // 1. Mudar de view IMEDIATAMENTE
      if (window.ViewManager) {
        window.ViewManager.goTo('detalheNotificacaoView');
      } else {
        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        document.getElementById('detalheNotificacaoView').classList.add('active');
      }
      
      // 2. Mostrar loading
      const container = document.getElementById('detalheContainer');
      if (container) {
        container.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon></div>';
      }
      
      // 3. Carregar dados
      await window.renderizarDetalheNotificacao(id);
    } else if (tipo === 'validacao') {
      if (imagem && typeof window.abrirValidacao === 'function') {
        // A função abrirValidacao já deve tratar da mudança de view e loading
        await window.abrirValidacao(imagem);
      } else {
        console.error("❌ Função abrirValidacao não disponível");
      }
    }
  } catch (error) {
    console.error('Erro no clique:', error);
    // Poderia mostrar um toast de erro aqui
  } finally {
    // Restaurar o card (se ele ainda existir na DOM)
    clicking = false;
    const updatedCard = document.querySelector(`[data-id="${id}"]`);
    if (updatedCard) {
      updatedCard.style.opacity = '1';
      updatedCard.style.pointerEvents = 'auto';
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
window.atualizarBadge = window.atualizarBadge;  // Mantido, mas é redundante
window.listarValidacoesPendentes = listarValidacoesPendentes;
