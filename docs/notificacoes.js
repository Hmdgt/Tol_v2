// ===============================
// 🔔 NOTIFICAÇÕES
// ===============================

// Usar configuração global (do config.js)
const GITHUB_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.NOTIFICACOES}`;
const GITHUB_HISTORICO_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.HISTORICO}`;

// ---------- FUNÇÃO DE NORMALIZAÇÃO DE JOGOS ----------
function normalizarJogo(jogo) {
    if (!jogo) return 'desconhecido';
    let normalizado = String(jogo).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/m1lhão|m1lhao/gi, 'milhao')
        .trim();
    
    // Mapear para as chaves canónicas
    if (normalizado.includes('eurodream')) return 'eurodreams';
    if (normalizado.includes('euromilho')) return 'euromilhoes';
    if (normalizado.includes('totoloto')) return 'totoloto';
    if (normalizado.includes('milhao')) return 'milhao';
    return normalizado;
}

// ---------- FUNÇÃO PARA OBTER LOGO DO JOGO (para notificações) ----------
function getLogoHTMLNotificacao(jogo) {
    const jogoNormalizado = normalizarJogo(jogo);
    
    if (jogoNormalizado === 'euromilhoes') {
        return '<div class="logo-sprite logo-euromilhoes">Euromilhões</div>';
    } else if (jogoNormalizado === 'totoloto') {
        return '<div class="logo-sprite logo-totoloto">Totoloto</div>';
    } else if (jogoNormalizado === 'eurodreams') {
        return '<div class="logo-sprite logo-eurodreams">EuroDreams</div>';
    } else if (jogoNormalizado === 'milhao') {
        return '<div class="logo-sprite logo-milhao">M1lhão</div>';
    } else {
        return `<span class="logo-placeholder">${escapeHTML(jogoNormalizado.toUpperCase())}</span>`;
    }
}

// ---------- FORMATAR DATA ----------
function formatarData(dataStr) {
    if (!dataStr) return '-';
    if (dataStr.includes('-')) {
        const [ano, mes, dia] = dataStr.split(' ')[0].split('-');
        return `${dia}/${mes}/${ano}`;
    }
    if (dataStr.includes('/')) return dataStr;
    return dataStr;
}

// ---------- FUNÇÃO AUXILIAR PARA BLOCO INLINE COM DESTAQUE DE ACERTOS ----------
function gerarBlocoInline(aposta, sorteio, acertos, jogoNormalizado) {
    let html = '<div class="numeros-aposta" style="justify-content: flex-start;">';
    
    // Números principais
    if (aposta.numeros) {
        const numerosAcertados = (sorteio && acertos && acertos.numeros_acertados) ? acertos.numeros_acertados : [];
        aposta.numeros.forEach(num => {
            const numStr = String(num).padStart(2, '0');
            const acertou = numerosAcertados.includes(num) || numerosAcertados.includes(parseInt(num));
            html += `<span class="numero-santacas ${acertou ? 'acerto' : ''}">${escapeHTML(numStr)}</span>`;
        });
    }
    
    // Verificar se há elementos especiais para adicionar separador "+"
    const temEspeciais = (aposta.estrelas && aposta.estrelas.length > 0) ||
                         (aposta.dream && aposta.dream.length > 0) ||
                         aposta.dream_number !== undefined ||
                         (aposta.numero_da_sorte && jogoNormalizado === 'totoloto');
    if (temEspeciais) {
        html += `<span class="separador-mais">+</span>`;
    }
    
    // Estrelas
    if (aposta.estrelas) {
        const estrelasAcertadas = (sorteio && acertos && acertos.estrelas_acertadas) ? acertos.estrelas_acertadas : [];
        aposta.estrelas.forEach(est => {
            const estStr = String(est).padStart(2, '0');
            const acertou = estrelasAcertadas.includes(est) || estrelasAcertadas.includes(parseInt(est));
            html += `<span class="estrela-santacas ${acertou ? 'acerto' : ''}">${escapeHTML(estStr)}</span>`;
        });
    }
    
    // Dream Number (EuroDreams)
    let dreamValue = null;
    if (aposta.dream && Array.isArray(aposta.dream) && aposta.dream.length > 0) {
        dreamValue = aposta.dream[0];
    } else if (aposta.dream_number !== undefined) {
        dreamValue = aposta.dream_number;
    }
    if (dreamValue && jogoNormalizado === 'eurodreams') {
        const dreamStr = String(dreamValue).padStart(2, '0');
        const acertou = (acertos && acertos.dream) ? acertos.dream : false;
        html += `<span class="estrela-santacas ${acertou ? 'acerto' : ''}">${escapeHTML(dreamStr)}</span>`;
    }
    
    // Nº da Sorte (Totoloto)
    if (aposta.numero_da_sorte && jogoNormalizado === 'totoloto') {
        const sorteStr = String(aposta.numero_da_sorte).padStart(2, '0');
        const acertou = (acertos && acertos.numero_da_sorte) ? acertos.numero_da_sorte : false;
        html += `<span class="estrela-santacas ${acertou ? 'acerto' : ''}">${escapeHTML(sorteStr)}</span>`;
    }
    
    html += '</div>';
    return html;
}

// ---------- FUNÇÃO PARA GERAR CONTEÚDO DO DETALHE (VERSÃO MELHORADA) ----------
function gerarConteudoDetalhes(notificacao) {
  const { jogo, titulo, resumo, detalhes } = notificacao;
  
  if (!detalhes) {
    return `<p>Sem detalhes disponíveis</p>`;
  }
  
  const jogoNormalizado = normalizarJogo(jogo);
  const dataFormatada = formatarData(notificacao.data);
  
  let html = `
    <div class="notification-card" style="margin-bottom: 0;">
      <div class="notification-header" style="justify-content: space-between;">
        ${getLogoHTMLNotificacao(jogo)}
        <span class="notification-date">${escapeHTML(dataFormatada)}</span>
      </div>
  `;
  
  // Informação do boletim (ref e concurso)
  if (detalhes.boletim) {
    const boletim = detalhes.boletim;
    html += `
      <div style="font-size: 12px; color: var(--text-secondary); text-align: right; margin: 8px 0 12px 0;">
        ${boletim.referencia ? `Ref: ${escapeHTML(boletim.referencia)}` : ''}
        ${boletim.concurso_sorteio ? `<br>Concurso: ${escapeHTML(boletim.concurso_sorteio)}` : ''}
      </div>
    `;
  }
  
  // ========== APOSTA ==========
  if (detalhes.aposta) {
    const aposta = detalhes.aposta;
    html += `<div style="margin: 12px 0;"><strong>Aposta</strong><br>`;
    
    if (jogoNormalizado === 'milhao' && aposta.codigo) {
      html += `<div class="numeros-aposta"><span class="codigo-milhao">${escapeHTML(aposta.codigo)}</span></div>`;
    } else {
      const acertos = detalhes.acertos || {};
      html += gerarBlocoInline(aposta, detalhes.sorteio, acertos, jogoNormalizado);
    }
    html += `</div>`;
  }
  
  // ========== SORTEIO ==========
  if (detalhes.sorteio) {
    const sorteio = detalhes.sorteio;
    html += `<div style="margin: 12px 0;"><strong>Sorteio</strong><br>`;
    
    if (jogoNormalizado === 'milhao' && sorteio.codigo_premiado) {
      html += `<div class="numeros-aposta"><span class="codigo-milhao">${escapeHTML(sorteio.codigo_premiado)}</span></div>`;
    } else {
      let sorteioHtml = '<div class="numeros-aposta" style="justify-content: flex-start;">';
      
      if (sorteio.numeros) {
        sorteio.numeros.forEach(num => {
          sorteioHtml += `<span class="numero-santacas">${escapeHTML(String(num).padStart(2, '0'))}</span>`;
        });
      }
      
      let temEspeciais = (sorteio.estrelas && sorteio.estrelas.length > 0) ||
                         (sorteio.dream) ||
                         (sorteio.numero_da_sorte);
      if (temEspeciais) sorteioHtml += `<span class="separador-mais">+</span>`;
      
      if (sorteio.estrelas) {
        sorteio.estrelas.forEach(est => {
          sorteioHtml += `<span class="estrela-santacas">${escapeHTML(String(est).padStart(2, '0'))}</span>`;
        });
      }
      if (sorteio.dream && jogoNormalizado === 'eurodreams') {
        sorteioHtml += `<span class="estrela-santacas">${escapeHTML(String(sorteio.dream).padStart(2, '0'))}</span>`;
      }
      if (sorteio.numero_da_sorte && jogoNormalizado === 'totoloto') {
        sorteioHtml += `<span class="estrela-santacas">${escapeHTML(String(sorteio.numero_da_sorte).padStart(2, '0'))}</span>`;
      }
      
      sorteioHtml += '</div>';
      html += sorteioHtml;
    }
    html += `</div>`;
  }
  
  // ========== ACERTOS (texto) ==========
  let acertoTexto = '';
  if (detalhes.acertos && detalhes.acertos.descricao) {
    acertoTexto = detalhes.acertos.descricao;
  } else if (resumo) {
    acertoTexto = resumo;
  }
  
  // ========== RODAPÉ: PRÉMIO ==========
  html += `<hr style="margin: 16px 0 8px;">`;
  html += `<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">`;
  
  if (detalhes.ganhou) {
    let valorPremio = '';
    if (detalhes.premios && detalhes.premios.length > 0) {
      const primeiroPremio = detalhes.premios[0];
      valorPremio = primeiroPremio.valor || primeiroPremio.premio || primeiroPremio.categoria || 'Ganhou!';
      if (primeiroPremio.descricao) {
        html += `<div style="font-size: 12px; color: var(--text-secondary);">${escapeHTML(primeiroPremio.descricao)}</div>`;
      }
    } else if (detalhes.premio) {
      valorPremio = detalhes.premio.valor || detalhes.premio.premio || detalhes.premio.categoria || 'Ganhou!';
      if (detalhes.premio.descricao) {
        html += `<div style="font-size: 12px; color: var(--text-secondary);">${escapeHTML(detalhes.premio.descricao)}</div>`;
      }
    }
    html += `<div style="color: var(--positive); font-weight: bold;">${escapeHTML(valorPremio)}</div>`;
    
    if (detalhes.valor_total) {
      html += `<div style="font-size: 12px; color: var(--text-secondary);">Total: ${escapeHTML(detalhes.valor_total)}</div>`;
    }
  } else {
    html += `<div style="color: var(--text-secondary);">Não ganhou</div>`;
  }
  
  if (acertoTexto) {
    html += `<div style="color: var(--positive);">${escapeHTML(acertoTexto)}</div>`;
  }
  
  html += `</div>`;
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
        jogo: jogos[0]?.tipo || 'validação',
        titulo: `${jogos.length} boletim(ins) por validar`,
        resumo: jogos.map(j => j.tipo).join(', '),
        data: jogos[0].data_processamento,
        imagem: imagem,
        jogos: jogos
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
        message: `Histórico: ${idNotificacao}`,
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
  
  container.innerHTML = gerarConteudoDetalhes(notificacao);
  
  marcarComoLida(idNotificacao);
};

// ---------- VOLTAR PARA A LISTA ----------
window.voltarParaLista = function() {
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
    const notificacoes = await carregarNotificacoes();
    const notificacoesNaoLidas = notificacoes.filter(n => !n.lido).map(n => ({
      ...n,
      tipo: 'notificacao',
      id_original: n.id,
      badge_text: 'Nova',
      badge_color: '#ff4444',
      icon: 'notifications-outline'
    }));
    
    const validacoesPendentes = await listarValidacoesPendentes();
    const validacoesComFormato = validacoesPendentes.map(v => ({
      ...v,
      badge_text: 'Pendente',
      badge_color: '#ffaa00',
      icon: 'create-outline'
    }));
    
    const todosCards = [...notificacoesNaoLidas, ...validacoesComFormato].sort((a, b) => {
      return new Date(b.data) - new Date(a.data);
    });

    if (todosCards.length === 0) {
      lista.innerHTML = '<div class="no-notifications">Sem notificações!</div>';
      return;
    }

    lista.innerHTML = todosCards.map(card => {
      const dataFormatada = formatarData(card.data);
      const jogoNome = escapeHTML(card.jogo || card.tipo);
      const titulo = escapeHTML(card.titulo || '');
      const resumo = card.resumo ? escapeHTML(card.resumo) : '';
      const logoHTML = getLogoHTMLNotificacao(jogoNome);
      
      return `
        <div class="notification-card" 
             data-id="${escapeHTML(card.id)}" 
             data-tipo="${escapeHTML(card.tipo)}"
             data-imagem="${escapeHTML(card.imagem || '')}">
          <div class="notification-header">
            ${logoHTML}
            <span class="unread-badge" style="background: ${escapeHTML(card.badge_color)}">${escapeHTML(card.badge_text)}</span>
            <span class="notification-date">${escapeHTML(dataFormatada)}</span>
          </div>
          <div class="notification-title">${titulo}</div>
          ${resumo ? `<div class="notification-resumo">${resumo}</div>` : ''}
        </div>
      `;
    }).join("");

    document.querySelectorAll(".notification-card").forEach(card => {
      card.addEventListener("click", handleNotificationClick);
    });
    
  } catch (err) {
    console.error("❌ Erro ao renderizar:", err);
    lista.innerHTML = '<div class="error">Erro ao carregar notificações</div>';
  }
}

// ---------- HANDLER PARA CLIQUE NOS CARDS ----------
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
  
  clicking = true;
  card.style.opacity = '0.5';
  card.style.pointerEvents = 'none';
  
  try {
    if (tipo === 'notificacao') {
      if (window.ViewManager) {
        window.ViewManager.goTo('detalheNotificacaoView');
      } else {
        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        document.getElementById('detalheNotificacaoView').classList.add('active');
      }
      
      const container = document.getElementById('detalheContainer');
      if (container) {
        container.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon></div>';
      }
      
      await window.renderizarDetalheNotificacao(id);
    } else if (tipo === 'validacao') {
      if (imagem && typeof window.abrirValidacao === 'function') {
        await window.abrirValidacao(imagem);
      } else {
        console.error("❌ Função abrirValidacao não disponível");
      }
    }
  } catch (error) {
    console.error('Erro no clique:', error);
  } finally {
    clicking = false;
    const updatedCard = document.querySelector(`[data-id="${id}"]`);
    if (updatedCard) {
      updatedCard.style.opacity = '1';
      updatedCard.style.pointerEvents = 'auto';
    }
  }
}

// ---------- ATUALIZAR BADGE ----------
window.atualizarBadge = async function() {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;
  
  try {
    const notificacoes = await carregarNotificacoes();
    const naoLidas = notificacoes.filter(n => !n.lido).length;
    
    const validacoes = await listarValidacoesPendentes();
    const totalValidacoes = validacoes.length;
    
    const total = naoLidas + totalValidacoes;
    
    badge.style.display = total > 0 ? "flex" : "none";
    badge.textContent = total > 99 ? "99+" : total;
    
    await atualizarBadgeIcone(total);
    
  } catch (err) {
    console.error("Erro ao atualizar badge:", err);
  }
};

// ========== NOVAS FUNÇÕES ==========

let ultimoTotal = 0;
let ultimoEstadoNotificacoes = 0;
let ultimoEstadoValidacoes = 0;

async function atualizarBadgeIcone(total) {
  if ('setAppBadge' in navigator) {
    try {
      if (total > 0 && !window.isAppEmPrimeiroPlano()) {
        await navigator.setAppBadge(total);
        console.log(`🔴 Badge do ícone: ${total}`);
      } else if (window.isAppEmPrimeiroPlano()) {
        await navigator.clearAppBadge();
      }
    } catch (err) {
      console.error("Erro ao atualizar badge do ícone:", err);
    }
  }
}

async function dispararPush(tipo, jogo) {
  const token = localStorage.getItem("github_token");
  if (!token) {
    console.warn("Token não configurado");
    return false;
  }
  
  try {
    const response = await fetch(
      `https://api.github.com/repos/${CONFIG.REPO}/actions/workflows/enviar-web-push.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { tipo, jogo }
        })
      }
    );
    
    if (response.ok) {
      console.log(`🚀 Push disparada: ${tipo} - ${jogo}`);
      return true;
    } else {
      console.error("Erro ao disparar push:", await response.text());
      return false;
    }
  } catch (err) {
    console.error("Erro de rede:", err);
    return false;
  }
}

async function verificarEDispararPush() {
  try {
    const notificacoes = await carregarNotificacoes();
    const naoLidas = notificacoes.filter(n => !n.lido).length;
    
    const validacoes = await listarValidacoesPendentes();
    const totalValidacoes = validacoes.length;
    
    const totalAtual = naoLidas + totalValidacoes;
    
    if (totalAtual > ultimoTotal) {
      let tipo = "resultados";
      let jogo = "Jogo";
      
      if (totalValidacoes > ultimoEstadoValidacoes) {
        tipo = "validacao";
        const primeira = Object.values(validacoes)[0];
        if (primeira && primeira[0]) {
          jogo = primeira[0].tipo;
        }
      } else if (naoLidas > ultimoEstadoNotificacoes) {
        const novas = notificacoes.filter(n => !n.lido);
        if (novas.length) {
          jogo = novas[0].jogo || "Jogo";
        }
      }
      
      if (!window.isAppEmPrimeiroPlano()) {
        console.log("App fechada, enviando push...");
        await dispararPush(tipo, jogo);
      } else {
        console.log("App aberta, apenas badge");
      }
    }
    
    ultimoTotal = totalAtual;
    ultimoEstadoNotificacoes = naoLidas;
    ultimoEstadoValidacoes = totalValidacoes;
    
  } catch (err) {
    console.error("Erro ao verificar novidades:", err);
  }
}

const originalAtualizarBadge = window.atualizarBadge;

window.atualizarBadge = async function() {
  if (originalAtualizarBadge) {
    await originalAtualizarBadge();
  }
  await verificarEDispararPush();
};

// ---------- FECHAR MODAL ----------
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
window.listarValidacoesPendentes = listarValidacoesPendentes;
window.verificarEDispararPush = verificarEDispararPush;
window.dispararPush = dispararPush;
window.atualizarBadgeIcone = atualizarBadgeIcone;
