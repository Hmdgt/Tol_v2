// ===============================
// 🔔 NOTIFICAÇÕES
// ===============================

const GITHUB_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.NOTIFICACOES}`;
const GITHUB_HISTORICO_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.HISTORICO}`;

// ========== PERSISTÊNCIA DO ESTADO ==========
function obterUltimoEstado() {
  try {
    const stored = sessionStorage.getItem('notificacoes_estado');
    if (stored) return JSON.parse(stored);
  } catch (err) {
    console.warn("Erro ao carregar estado:", err);
  }
  return {
    ultimoTotal: 0,
    ultimoEstadoNotificacoes: 0,
    ultimoEstadoValidacoes: 0,
    ultimoCheck: new Date().toISOString()
  };
}

function guardarUltimoEstado(estado) {
  try {
    sessionStorage.setItem('notificacoes_estado', JSON.stringify(estado));
  } catch (err) {
    console.warn("Erro ao guardar estado:", err);
  }
}

let estadoNotificacoes = obterUltimoEstado();

window.detalheOrigem = 'notificacoesView';

function normalizarJogo(jogo) {
    if (!jogo) return 'desconhecido';
    let normalizado = String(jogo).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/m1lhão|m1lhao/gi, 'milhao')
        .trim();
    if (normalizado.includes('eurodream')) return 'eurodreams';
    if (normalizado.includes('euromilho')) return 'euromilhoes';
    if (normalizado.includes('totoloto')) return 'totoloto';
    if (normalizado.includes('milhao')) return 'milhao';
    return normalizado;
}

function getLogoHTMLNotificacao(jogo) {
    const jogoNormalizado = normalizarJogo(jogo);
    if (jogoNormalizado === 'euromilhoes') return '<div class="logo-sprite logo-euromilhoes">Euromilhões</div>';
    if (jogoNormalizado === 'totoloto') return '<div class="logo-sprite logo-totoloto">Totoloto</div>';
    if (jogoNormalizado === 'eurodreams') return '<div class="logo-sprite logo-eurodreams">EuroDreams</div>';
    if (jogoNormalizado === 'milhao') return '<div class="logo-sprite logo-milhao">M1lhão</div>';
    return `<span class="logo-placeholder">${escapeHTML(jogoNormalizado.toUpperCase())}</span>`;
}

function formatarData(dataStr) {
    if (!dataStr) return '-';
    if (dataStr.includes('-')) {
        const [ano, mes, dia] = dataStr.split(' ')[0].split('-');
        return `${dia}/${mes}/${ano}`;
    }
    if (dataStr.includes('/')) return dataStr;
    return dataStr;
}

function gerarBlocoInline(aposta, sorteio, acertos, jogoNormalizado) {
    if (jogoNormalizado === 'milhao' && aposta.codigo) {
        return `<div class="numeros-aposta"><span class="codigo-milhao">${escapeHTML(aposta.codigo)}</span></div>`;
    }

    let html = '<div class="numeros-aposta">';
    
    if (aposta.numeros) {
        const numerosAcertados = (sorteio && acertos && acertos.numeros_acertados) ? acertos.numeros_acertados : [];
        aposta.numeros.forEach(num => {
            const numStr = String(num).padStart(2, '0');
            const acertou = numerosAcertados.includes(num) || numerosAcertados.includes(parseInt(num));
            html += `<span class="numero-santacas ${acertou ? 'acerto' : ''}">${escapeHTML(numStr)}</span>`;
        });
    }
    
    const temEspeciais = (aposta.estrelas && aposta.estrelas.length > 0) ||
                         (aposta.dream && aposta.dream.length > 0) ||
                         aposta.dream_number !== undefined ||
                         (aposta.numero_da_sorte && jogoNormalizado === 'totoloto');
    if (temEspeciais) html += `<span class="separador-mais">+</span>`;
    
    if (aposta.estrelas) {
        const estrelasAcertadas = (sorteio && acertos && acertos.estrelas_acertadas) ? acertos.estrelas_acertadas : [];
        aposta.estrelas.forEach(est => {
            const estStr = String(est).padStart(2, '0');
            const acertou = estrelasAcertadas.includes(est) || estrelasAcertadas.includes(parseInt(est));
            html += `<span class="estrela-santacas ${acertou ? 'acerto' : ''}">${escapeHTML(estStr)}</span>`;
        });
    }
    
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
    
    if (aposta.numero_da_sorte && jogoNormalizado === 'totoloto') {
        const sorteStr = String(aposta.numero_da_sorte).padStart(2, '0');
        const acertou = (acertos && acertos.numero_da_sorte) ? acertos.numero_da_sorte : false;
        html += `<span class="estrela-santacas ${acertou ? 'acerto' : ''}">${escapeHTML(sorteStr)}</span>`;
    }
    
    html += '</div>';
    return html;
}

function gerarConteudoDetalhes(notificacao) {
  const { jogo, titulo, resumo, detalhes } = notificacao;
  if (!detalhes) return `<p>Sem detalhes disponíveis</p>`;
  
  const jogoNormalizado = normalizarJogo(jogo);
  const dataFormatada = formatarData(notificacao.data);
  
  let html = `
    <div class="notification-card" style="margin-bottom: 0;">
      <div class="notification-header" style="justify-content: space-between;">
        ${getLogoHTMLNotificacao(jogo)}
        <span class="notification-date">${escapeHTML(dataFormatada)}</span>
      </div>
  `;
  
  if (detalhes.boletim) {
    const boletim = detalhes.boletim;
    html += `
      <div style="font-size: 12px; color: var(--text-secondary); text-align: right; margin: 8px 0 12px 0;">
        ${boletim.referencia ? `Ref: ${escapeHTML(boletim.referencia)}` : ''}
        ${boletim.concurso_sorteio ? `<br>Concurso: ${escapeHTML(boletim.concurso_sorteio)}` : ''}
      </div>
    `;
  }
  
  if (detalhes.aposta) {
    const aposta = detalhes.aposta;
    html += `<div class="bloco-jogo"><span class="titulo-bloco">Aposta</span>`;
    if (jogoNormalizado === 'milhao' && aposta.codigo) {
      html += `<div class="numeros-aposta"><span class="codigo-milhao">${escapeHTML(aposta.codigo)}</span></div>`;
    } else {
      const acertos = detalhes.acertos || {};
      html += gerarBlocoInline(aposta, detalhes.sorteio, acertos, jogoNormalizado);
    }
    html += `</div>`;
  }
  
  if (detalhes.sorteio) {
    const sorteio = detalhes.sorteio;
    html += `<div class="bloco-jogo"><span class="titulo-bloco">Sorteio</span>`;
    if (jogoNormalizado === 'milhao' && sorteio.codigo_premiado) {
      html += `<div class="numeros-aposta"><span class="codigo-milhao">${escapeHTML(sorteio.codigo_premiado)}</span></div>`;
    } else {
      let sorteioHtml = '<div class="numeros-aposta">';
      if (sorteio.numeros) {
        sorteio.numeros.forEach(num => {
          sorteioHtml += `<span class="numero-santacas">${escapeHTML(String(num).padStart(2, '0'))}</span>`;
        });
      }
      let temEspeciais = (sorteio.estrelas && sorteio.estrelas.length > 0) || sorteio.dream || sorteio.numero_da_sorte;
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
  
  let acertoTexto = '';
  if (detalhes.acertos && detalhes.acertos.descricao) {
    acertoTexto = detalhes.acertos.descricao;
  } else if (resumo) {
    acertoTexto = resumo;
  }
  
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

  // BOTÕES (VOLTAR + RECLAMAR, se for prémio não arquivado)
  html += `
    <div class="botoes-validacao" style="justify-content: center; margin-top: 16px;">
      <button class="btn-cancelar" id="btnVoltarDetalhe" type="button">
        <ion-icon name="arrow-back-outline"></ion-icon> Voltar
      </button>
  `;

  if (detalhes?.ganhou && !notificacao.arquivado) {
    html += `
      <button class="btn-validar" id="btnReclamarDetalhe" type="button" style="flex: 2;">
        <ion-icon name="checkmark-circle-outline"></ion-icon> Confirmar leitura
      </button>
    `;
  }

  html += `
    </div>
  `;
  
  html += `</div>`; // fecha notification-card
  return html;
}

async function lerFicheiroGitHub(urlApi) {
  const token = localStorage.getItem("github_token");
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(urlApi + `?t=${Date.now()}`, { headers });
    if (!res.ok) return { content: [], sha: null };
    const data = await res.json();
    const jsonText = base64ToString(data.content);
    return { content: JSON.parse(jsonText), sha: data.sha };
  } catch (err) {
    console.error("Erro ao ler ficheiro GitHub:", err);
    return { content: [], sha: null };
  }
}

async function carregarNotificacoes() {
  try {
    const { content } = await lerFicheiroGitHub(GITHUB_API);
    return content;
  } catch (err) {
    console.error("Erro ao carregar notificações:", err);
    return [];
  }
}

async function listarValidacoesPendentes() {
  try {
    if (typeof window.listarBoletinsPorValidar !== 'function') return [];
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
    // 1. Carregar ativas e histórico
    const fAtivas = await lerFicheiroGitHub(GITHUB_API);
    const fHist = await lerFicheiroGitHub(GITHUB_HISTORICO_API);
    const historico = fHist.content || [];
    let novasAtivas = fAtivas.content || [];

    let notificacao = novasAtivas.find(n => n.id === idNotificacao);
    let origem = 'ativas';

    if (!notificacao) {
      // Se não está nas ativas, está no histórico
      notificacao = historico.find(n => n.id === idNotificacao);
      origem = 'historico';
    }

    if (!notificacao) {
      console.warn("Notificação não encontrada em nenhum ficheiro.");
      return true;
    }

    // 2. Marcar como lida/arquivada
    notificacao.lido = true;
    notificacao.arquivado = true;
    notificacao.data_leitura = notificacao.data_leitura || new Date().toISOString();

    // 3. Se estava nas ativas, remover de lá
    if (origem === 'ativas') {
      novasAtivas = novasAtivas.filter(n => n.id !== idNotificacao);
      const ativasContent = JSON.stringify(novasAtivas, null, 2);
      const ativasBase64 = stringToBase64(ativasContent);
      const ativasResponse = await fetch(GITHUB_API, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Lida: ${idNotificacao}`, content: ativasBase64, sha: fAtivas.sha })
      });
      if (!ativasResponse.ok) {
        console.error("Erro ao atualizar ativas:", await ativasResponse.json());
        return false;
      }
    }

    // 4. Atualizar ou adicionar no histórico
    const indexNoHistorico = historico.findIndex(n => n.id === idNotificacao);
    if (indexNoHistorico !== -1) {
      historico[indexNoHistorico] = notificacao;
    } else {
      historico.push(notificacao);
    }

    const histContent = JSON.stringify(historico, null, 2);
    const histBase64 = stringToBase64(histContent);
    const bodyHist = { message: `Histórico: ${idNotificacao}`, content: histBase64 };
    if (fHist.sha) bodyHist.sha = fHist.sha;
    await fetch(GITHUB_HISTORICO_API, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyHist)
    });

    if (typeof window.atualizarBadge === "function") {
      await window.atualizarBadge();
    }
    
    return true;
  } catch (err) {
    console.error("❌ Erro ao marcar como lida:", err);
    return false;
  }
}

window.renderizarDetalheNotificacao = async function(idNotificacao) {
  const container = document.getElementById('detalheContainer');
  if (!container) return;
  
  container.innerHTML = '<div class="loading"><ion-icon name="sync-outline"></ion-icon></div>';
  
  const notificacoes = await carregarNotificacoes();
  let notificacao = notificacoes.find(n => n.id === idNotificacao);
  
  if (!notificacao) {
    try {
      const { content: historico } = await carregarFicheiroGitHub(CONFIG.FICHEIROS.HISTORICO);
      if (historico && Array.isArray(historico)) {
        notificacao = historico.find(item => item.id === idNotificacao);
      }
    } catch (err) {
      console.error("Erro ao procurar no histórico:", err);
    }
  }
  
  if (!notificacao) {
    container.innerHTML = '<p>Notificação não encontrada</p>';
    return;
  }
  
  container.innerHTML = gerarConteudoDetalhes(notificacao);

  // Botão Voltar
  const btnVoltar = document.getElementById('btnVoltarDetalhe');
  if (btnVoltar) {
    btnVoltar.addEventListener('click', () => {
      const destino = window.detalheOrigem || 'notificacoesView';
      if (destino === 'apostasView' && typeof window.carregarApostasView === 'function') {
        window.carregarApostasView();
      } else if (destino === 'notificacoesView' && typeof window.renderizarNotificacoes === 'function') {
        window.renderizarNotificacoes();
      }
      window.ViewManager.goTo(destino);
    });
  }

  // Botão Reclamar
  const btnReclamar = document.getElementById('btnReclamarDetalhe');
  if (btnReclamar) {
    btnReclamar.addEventListener('click', async () => {
      if (await marcarComoLida(idNotificacao)) {
        const destino = window.detalheOrigem || 'notificacoesView';
        if (destino === 'apostasView' && typeof window.carregarApostasView === 'function') {
          window.carregarApostasView();
        } else if (destino === 'notificacoesView' && typeof window.renderizarNotificacoes === 'function') {
          window.renderizarNotificacoes();
        }
        window.ViewManager.goTo(destino);
      }
    });
  }

  // Long press no cartão de detalhe
  const cardDetalhe = container.querySelector('.notification-card');
  if (cardDetalhe) {
    let pressTimer = null;
    cardDetalhe.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(async () => {
        if (notificacao.detalhes?.ganhou && !notificacao.arquivado) {
          if (confirm('Marcar este prémio como reclamado?')) {
            if (await marcarComoLida(idNotificacao)) {
              const destino = window.detalheOrigem || 'notificacoesView';
              if (destino === 'apostasView' && typeof window.carregarApostasView === 'function') {
                window.carregarApostasView();
              } else if (destino === 'notificacoesView' && typeof window.renderizarNotificacoes === 'function') {
                window.renderizarNotificacoes();
              }
              window.ViewManager.goTo(destino);
            }
          }
        }
      }, 800);
    });
    cardDetalhe.addEventListener('pointerup', () => clearTimeout(pressTimer));
    cardDetalhe.addEventListener('pointerleave', () => clearTimeout(pressTimer));
  }

  // Arquiva automaticamente se estava nas ativas
  if (notificacoes.some(n => n.id === idNotificacao)) {
    marcarComoLida(idNotificacao);
  }
};

window.voltarParaLista = function() {
  if (window.ViewManager) {
    window.ViewManager.goTo('notificacoesView');
  } else {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById('notificacoesView').classList.add('active');
  }
  renderizarNotificacoes();
};

async function renderizarNotificacoes() {
  const lista = document.getElementById("notificationsList");
  if (!lista) return;

  lista.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon></div>';

  try {
    const notificacoes = await carregarNotificacoes();
    const notificacoesNaoLidas = notificacoes.filter(n => !n.lido).map(n => ({
      ...n, tipo: 'notificacao', badge_text: 'Nova', badge_color: '#ff4444', icon: 'notifications-outline'
    }));
    const validacoesPendentes = await listarValidacoesPendentes();
    const validacoesComFormato = validacoesPendentes.map(v => ({
      ...v, badge_text: 'Pendente', badge_color: '#ffaa00', icon: 'create-outline'
    }));
    const todosCards = [...notificacoesNaoLidas, ...validacoesComFormato].sort((a, b) => new Date(b.data) - new Date(a.data));

    if (!todosCards.length) {
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
        <div class="notification-card" data-id="${escapeHTML(card.id)}" data-tipo="${escapeHTML(card.tipo)}" data-imagem="${escapeHTML(card.imagem || '')}">
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
    lista.innerHTML = '<div class="error">Erro ao carregar notificações</div>';
  }
}

let clicking = false;
async function handleNotificationClick(e) {
  if (clicking) return;
  const card = e.currentTarget;
  const id = card.dataset.id;
  const tipo = card.dataset.tipo;
  const imagem = card.dataset.imagem;
  clicking = true;
  card.style.opacity = '0.5';
  card.style.pointerEvents = 'none';
  try {
    if (tipo === 'notificacao') {
      window.detalheOrigem = 'notificacoesView';
      if (window.ViewManager) {
        window.ViewManager.goTo('detalheNotificacaoView');
      } else {
        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        document.getElementById('detalheNotificacaoView').classList.add('active');
      }
      const container = document.getElementById('detalheContainer');
      if (container) container.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon></div>';
      await window.renderizarDetalheNotificacao(id);
    } else if (tipo === 'validacao') {
      if (imagem && typeof window.abrirValidacao === 'function') {
        await window.abrirValidacao(imagem);
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

window.atualizarBadge = async function() {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;
  try {
    const notificacoes = await carregarNotificacoes();
    const naoLidas = notificacoes.filter(n => !n.lido).length;
    const validacoes = await listarValidacoesPendentes();
    const totalAtual = naoLidas + validacoes.length;
    badge.style.display = totalAtual > 0 ? "flex" : "none";
    badge.textContent = totalAtual > 99 ? "99+" : totalAtual;
    await atualizarBadgeIcone(totalAtual);
    estadoNotificacoes = { ultimoTotal: totalAtual, ultimoEstadoNotificacoes: naoLidas, ultimoEstadoValidacoes: validacoes.length, ultimoCheck: new Date().toISOString() };
    guardarUltimoEstado(estadoNotificacoes);
  } catch (err) {
    console.error("❌ Erro ao atualizar badge:", err);
  }
};

async function atualizarBadgeIcone(total) {
  if ('setAppBadge' in navigator) {
    try {
      if (total > 0 && !window.isAppEmPrimeiroPlano()) {
        await navigator.setAppBadge(total);
      } else if (window.isAppEmPrimeiroPlano()) {
        await navigator.clearAppBadge();
      }
    } catch (err) {
      console.error("Erro ao atualizar badge do ícone:", err);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modalDetalhes');
  if (modal) {
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') window.atualizarBadge();
  });
});

window.renderizarNotificacoes = renderizarNotificacoes;
window.marcarComoLida = marcarComoLida;
window.carregarNotificacoes = carregarNotificacoes;
window.listarValidacoesPendentes = listarValidacoesPendentes;
window.atualizarBadgeIcone = atualizarBadgeIcone;
