// ===============================
// 🎫 VIEW APOSTAS (Pendentes, Premiados, Histórico)
// ===============================

let apostaJogoAtual = 'global';
let apostaAbaAtual = 'pendentes';

// ---------- FUNÇÃO AUXILIAR (MOVIDA PARA AQUI) ----------
function formatarNumerosAposta(aposta, jogo) {
    const jogoNormalizado = normalizarJogo(jogo);

    // M1LHÃO: código sem círculos
    if (jogoNormalizado === 'milhao' && aposta.codigo) {
        return `<div class="numeros-aposta" style="display: flex; align-items: center; gap: 6px;">
                    <span class="codigo-milhao">${escapeHTML(aposta.codigo)}</span>
                </div>`;
    }

    let html = '<div class="numeros-aposta">';
    
    // Números principais
    if (aposta.numeros && aposta.numeros.length > 0) {
        aposta.numeros.forEach(num => {
            html += `<span class="numero-santacas">${escapeHTML(String(num).padStart(2, '0'))}</span>`;
        });
    }
    
    // Verifica se há elementos especiais para adicionar o sinal "+"
    let temEspeciais = false;
    if ((aposta.estrelas && aposta.estrelas.length > 0) ||
        (aposta.dream && aposta.dream.length > 0) ||
        aposta.dream_number !== undefined ||
        (aposta.numero_da_sorte && jogoNormalizado === 'totoloto')) {
        temEspeciais = true;
        html += `<span class="separador-mais">+</span>`;
    }
    
    // Estrelas (Euromilhões)
    if (aposta.estrelas && aposta.estrelas.length > 0) {
        aposta.estrelas.forEach(est => {
            html += `<span class="estrela-santacas">${escapeHTML(String(est).padStart(2, '0'))}</span>`;
        });
    }
    
    // Dream Number (EuroDreams)
    if (aposta.dream_number !== undefined && jogoNormalizado === 'eurodreams') {
        html += `<span class="estrela-santacas">${escapeHTML(String(aposta.dream_number).padStart(2, '0'))}</span>`;
    } else if (aposta.dream && Array.isArray(aposta.dream) && aposta.dream.length > 0 && jogoNormalizado === 'eurodreams') {
        html += `<span class="estrela-santacas">${escapeHTML(String(aposta.dream[0]).padStart(2, '0'))}</span>`;
    }
    
    // Nº da Sorte (Totoloto)
    if (aposta.numero_da_sorte && jogoNormalizado === 'totoloto') {
        html += `<span class="estrela-santacas">${escapeHTML(String(aposta.numero_da_sorte).padStart(2, '0'))}</span>`;
    }
    
    html += '</div>';
    return html;
}


// ---------- LEITURA DE PENDENTES (comportamento original) ----------
async function obterApostasPendentes(jogoFiltro) {
  // 1. Carregar todas as apostas de todos os tipos de jogo
  const todasApostas = [];
  const tipos = CONFIG.TIPOS_JOGO.filter(t => jogoFiltro === 'global' || t === jogoFiltro);
  for (const tipo of tipos) {
    const { content } = await carregarFicheiroGitHub(`${CONFIG.PASTAS.APOSTAS}${tipo}.json`);
    if (content && Array.isArray(content)) {
      todasApostas.push(...content.map(j => ({ ...j, _tipo_arquivo: tipo })));
    }
  }

  // 2. Carregar histórico de verificações para saber que boletins já foram verificados
  const { content: historico } = await carregarFicheiroGitHub(CONFIG.FICHEIROS.HISTORICO);
  const refsVerificadas = new Set();
  (historico || []).forEach(item => {
    const ref = item.detalhes?.boletim?.referencia || item.id || item.referencia_unica;
    if (ref) refsVerificadas.add(ref);
  });

  // 3. Pendentes = apostas que NÃO estão no histórico (inclui validados mas ainda sem sorteio)
  return todasApostas.filter(aposta => {
    const ref = aposta.referencia_unica || aposta.id;
    return !refsVerificadas.has(ref);
  });
}

// ---------- LEITURA DE PREMIADOS PENDENTES (NOVO FICHEIRO) ----------
async function obterPremiadosPendentes(jogoFiltro) {
  // Caminho relativo para o ficheiro (a função carregarFicheiroGitHub já junta o CONFIG.REPO)
  const { content } = await carregarFicheiroGitHub("resultados/premiados_pendentes.json");
  let itens = content || [];
  if (jogoFiltro !== 'global') {
    itens = itens.filter(item => item.jogo === jogoFiltro);
  }
  itens = itens.filter(item => !item.arquivado);
  itens.sort((a, b) => new Date(b.data) - new Date(a.data));
  return itens;
}

// ---------- CONFIRMAR PREMIADO (REMOVER DO FICHEIRO PREMIADOS_PENDENTES) ----------
async function confirmarPremiado(id) {
  const token = localStorage.getItem("github_token");
  if (!token) {
    alert("Token não configurado.");
    return false;
  }

  const caminhoRelativo = "resultados/premiados_pendentes.json";
  const urlAPI = `https://api.github.com/repos/${CONFIG.REPO}/contents/${caminhoRelativo}`;

  try {
    const { content, sha } = await carregarFicheiroGitHub(caminhoRelativo);
    if (!sha) {
      console.error("Sem SHA para atualizar premiados_pendentes.json");
      return false;
    }

    const atualizado = (content || []).filter(item => item.id !== id);

    const body = {
      message: `Prémio ${id} confirmado`,
      content: stringToBase64(JSON.stringify(atualizado, null, 2)),
      sha: sha
    };

    const response = await fetch(urlAPI, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error("Erro ao confirmar prémio:", await response.json());
      return false;
    }

    // ✅ Marca como lida/arquivada no histórico
    if (typeof marcarComoLida === 'function') {
      await marcarComoLida(id);
    }

    return true;
  } catch (err) {
    console.error("Erro ao confirmar prémio:", err);
    return false;
  }
}

// ---------- LEITURA DO HISTÓRICO DE VERIFICAÇÕES (mantido igual) ----------
async function obterHistoricoVerificacoes(jogoFiltro, apenasPremiados = false) {
  const { content } = await carregarFicheiroGitHub(CONFIG.FICHEIROS.HISTORICO);
  let itens = content || [];
  if (jogoFiltro !== 'global') {
    itens = itens.filter(item => item.jogo === jogoFiltro);
  }
  if (apenasPremiados) {
    itens = itens.filter(item => item.detalhes?.ganhou && !item.arquivado);
  }
  itens.sort((a, b) => new Date(b.data) - new Date(a.data));
  return itens;
}

// ---------- RENDERIZADORES ----------
async function renderizarPendentes(container) {
  const pendentes = await obterApostasPendentes(apostaJogoAtual);
  if (!pendentes.length) {
    container.innerHTML = '<div class="no-notifications">Nenhum boletim pendente</div>';
    return;
  }

  // Ordenar por data do sorteio (a mesma ordenação que existia nas estatísticas)
  pendentes.sort((a, b) => new Date(a.data_sorteio) - new Date(b.data_sorteio));

  container.innerHTML = pendentes.map(aposta => {
    const jogo = aposta.tipo || aposta._tipo_arquivo || 'desconhecido';
    const dataSorteio = aposta.data_sorteio;
    const concurso = aposta.concurso || '-';
    const referencia = aposta.referencia_unica || '-';
    const logoHTML = getLogoHTMLNotificacao(jogo);

    // Formatar números da aposta (usa a função do notificacoes.js)
    let numerosHTML = '';
    if (aposta.apostas && Array.isArray(aposta.apostas)) {
      numerosHTML = aposta.apostas.map(ap => formatarNumerosAposta(ap, jogo)).join('<div style="margin: 8px 0;"></div>');
    } else {
      numerosHTML = formatarNumerosAposta(aposta, jogo);
    }

    return `
      <div class="notification-card" style="cursor: default;">
        <div class="notification-header">
          ${logoHTML}
          <span class="notification-date-label">DATA:</span>
          <span class="notification-date">${escapeHTML(formatarData(dataSorteio))}</span>
        </div>
        <div class="notification-info-right">
          <div class="notification-concurso">CONCURSO ${escapeHTML(concurso)}</div>
          <div class="notification-referencia">REF. ${escapeHTML(referencia)}</div>
        </div>
        <div class="notification-resumo-pendente">
          ${numerosHTML}
        </div>
      </div>
    `;
  }).join('');
}

async function renderizarPremiados(container) {
  // ALTERADO: agora lê do novo ficheiro premiados_pendentes.json
  const premiados = await obterPremiadosPendentes(apostaJogoAtual);
  if (!premiados.length) {
    container.innerHTML = '<div class="no-notifications">Nenhum prémio por confirmar</div>';
    return;
  }

  container.innerHTML = premiados.map(item => {
    const det = item.detalhes;
    const logoHTML = getLogoHTMLNotificacao(item.jogo);
    const bloco = gerarBlocoInline(det.aposta, det.sorteio, det.acertos, normalizarJogo(item.jogo));
    return `
      <div class="notification-card" data-id="${escapeHTML(item.id)}">
        <div class="notification-header">
          ${logoHTML}
          <span class="notification-date">${escapeHTML(formatarData(item.data))}</span>
        </div>
        <div class="numeros-aposta" style="justify-content: flex-start;">${bloco}</div>
        <button class="btn-santacas btn-arquivar" data-id="${escapeHTML(item.id)}" style="margin-top:8px; width:100%;">Confirmar leitura</button>
      </div>
    `;
  }).join('');

  // --- BOTÃO "CONFIRMAR LEITURA" (clique normal) ---
  container.querySelectorAll('.btn-arquivar').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      // ALTERADO: usa confirmarPremiado em vez de marcarComoLida
      if (await confirmarPremiado(id)) {
        renderizarPremiados(container);
      }
    });
  });

  // --- LONG PRESS NOS CARTÕES DOS PREMIADOS ---
  const cards = container.querySelectorAll('.notification-card');
  cards.forEach(card => {
    let pressTimer = null;
    let longPressTriggered = false;

    // Início do toque/clique
    card.addEventListener('pointerdown', (e) => {
      longPressTriggered = false;
      pressTimer = setTimeout(() => {
        longPressTriggered = true;
        const id = card.dataset.id;
        // Diálogo de confirmação simples
        if (confirm('Marcar este prémio como reclamado?')) {
          // ALTERADO: usa confirmarPremiado
          confirmarPremiado(id).then(() => {
            renderizarPremiados(container);
          });
        }
      }, 800); // 800 ms para considerar long press
    });

    // Fim do toque/clique (cancelar temporizador se for curto)
    card.addEventListener('pointerup', () => {
      clearTimeout(pressTimer);
    });

    card.addEventListener('pointerleave', () => {
      clearTimeout(pressTimer);
    });

    // Prevenir que o clique normal abra o detalhe durante o long press
    card.addEventListener('click', (e) => {
      if (longPressTriggered) {
        e.stopPropagation();
        e.preventDefault();
      } else {
        const id = card.dataset.id;
        if (typeof window.renderizarDetalheNotificacao === 'function') {
          window.detalheOrigem = 'apostasView';
          window.renderizarDetalheNotificacao(id);
          window.ViewManager.goTo('detalheNotificacaoView');
        }
      }
    });
  });
}

async function renderizarHistorico(container) {
  const historico = await obterHistoricoVerificacoes(apostaJogoAtual, false);
  if (!historico.length) {
    container.innerHTML = '<div class="no-notifications">Nenhum histórico disponível</div>';
    return;
  }

  container.innerHTML = historico.map(item => {
    const det = item.detalhes;
    const logoHTML = getLogoHTMLNotificacao(item.jogo);
    const bloco = gerarBlocoInline(det.aposta, det.sorteio, det.acertos, normalizarJogo(item.jogo));
    return `
      <div class="notification-card" data-id="${escapeHTML(item.id)}">
        <div class="notification-header">
          ${logoHTML}
          <span class="notification-date">${escapeHTML(formatarData(item.data))}</span>
        </div>
        <div class="numeros-aposta" style="justify-content: flex-start;">${bloco}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.notification-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (typeof window.renderizarDetalheNotificacao === 'function') {
        window.detalheOrigem = 'apostasView';
        window.renderizarDetalheNotificacao(id);
        window.ViewManager.goTo('detalheNotificacaoView');
      }
    });
  });
}

// ---------- FUNÇÃO PRINCIPAL (chamada pelo ViewManager) ----------
window.carregarApostasView = async function() {
  const container = document.getElementById('apostasList');
  if (!container) return;

  // Atualiza o destaque da aba ativa
  document.querySelectorAll('#apostasTabs .periodo-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === apostaAbaAtual);
  });

  container.innerHTML = '<div class="loading"><ion-icon name="sync-outline"></ion-icon></div>';

  switch (apostaAbaAtual) {
    case 'pendentes': await renderizarPendentes(container); break;
    case 'premiados': await renderizarPremiados(container); break;
    case 'historico': await renderizarHistorico(container); break;
  }
};

// ---------- EVENTOS DA INTERFACE ----------
document.addEventListener('DOMContentLoaded', () => {
  const select = document.getElementById('apostasJogoSelect');
  if (select) {
    select.addEventListener('change', (e) => {
      apostaJogoAtual = e.target.value;
      if (typeof window.carregarApostasView === 'function') window.carregarApostasView();
    });
  }

  const tabs = document.querySelectorAll('#apostasTabs .periodo-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      apostaAbaAtual = btn.dataset.tab;
      if (typeof window.carregarApostasView === 'function') window.carregarApostasView();
    });
  });

  // Destacar aba ativa inicial
  const ativa = document.querySelector(`#apostasTabs .periodo-btn[data-tab="${apostaAbaAtual}"]`);
  if (ativa) ativa.classList.add('active');
});
