// ===============================
// 🎫 VIEW APOSTAS (Pendentes, Premiados, Histórico)
// ===============================

let apostaJogoAtual = 'global';
let apostaAbaAtual = 'pendentes';

// ---------- LEITURA DE PENDENTES ----------
async function obterApostasPendentes(jogoFiltro) {
  const tipos = CONFIG.TIPOS_JOGO.filter(t => jogoFiltro === 'global' || t === jogoFiltro);
  const pendentes = [];
  for (const tipo of tipos) {
    const { content } = await carregarFicheiroGitHub(`${CONFIG.PASTAS.APOSTAS}${tipo}.json`);
    if (content && Array.isArray(content)) {
      const naoConfirmados = content.filter(j => !j.confirmado);
      pendentes.push(...naoConfirmados.map(j => ({ ...j, _tipo_arquivo: tipo })));
    }
  }
  return pendentes;
}

// ---------- LEITURA DO HISTÓRICO DE VERIFICAÇÕES ----------
async function obterHistoricoVerificacoes(jogoFiltro, apenasPremiados = false) {
  const { content } = await lerFicheiroGitHub(CONFIG.FICHEIROS.HISTORICO);
  let itens = content || [];
  if (jogoFiltro !== 'global') itens = itens.filter(item => item.jogo === jogoFiltro);
  if (apenasPremiados) itens = itens.filter(item => item.detalhes?.ganhou && !item.arquivado);
  itens.sort((a, b) => new Date(b.data) - new Date(a.data));
  return itens;
}

// ---------- RENDERIZADORES ----------
async function renderizarPendentes(container) {
  const pendentes = await obterApostasPendentes(apostaJogoAtual);
  if (!pendentes.length) {
    container.innerHTML = '<div class="no-notifications">✅ Nenhum boletim pendente</div>';
    return;
  }

  const agrupado = {};
  pendentes.forEach(p => {
    const img = p.imagem_origem;
    if (!agrupado[img]) agrupado[img] = { imagem: img, tipo: p._tipo_arquivo, boletins: [] };
    agrupado[img].boletins.push(p);
  });

  container.innerHTML = Object.values(agrupado).map(grupo => {
    const logoHTML = getLogoHTMLNotificacao(grupo.tipo);
    const ref = grupo.boletins[0].referencia_unica || grupo.imagem;
    return `
      <div class="notification-card validacao-card" data-imagem="${escapeHTML(grupo.imagem)}">
        <div class="validacao-card-header">
          ${logoHTML}
          <span class="validacao-imagem">${escapeHTML(ref)}</span>
          <span class="validacao-badge">${grupo.boletins.length}</span>
        </div>
        <div class="validacao-tipos">${escapeHTML(grupo.tipo)}</div>
        <div class="validacao-preview">Clique para validar</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.validacao-card').forEach(card => {
    card.addEventListener('click', () => {
      const img = card.dataset.imagem;
      if (typeof window.abrirValidacao === 'function') window.abrirValidacao(img);
    });
  });
}

async function renderizarPremiados(container) {
  const premiados = await obterHistoricoVerificacoes(apostaJogoAtual, true);
  if (!premiados.length) {
    container.innerHTML = '<div class="no-notifications">🏆 Nenhum prémio por confirmar</div>';
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
        <div class="notification-resumo">${escapeHTML(item.resumo)}</div>
        <button class="btn-santacas btn-arquivar" data-id="${escapeHTML(item.id)}" style="margin-top:8px; width:100%;">Confirmar leitura</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-arquivar').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (await marcarComoLida(id)) {
        renderizarPremiados(container);
      }
    });
  });

  container.querySelectorAll('.notification-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (typeof window.renderizarDetalheNotificacao === 'function') {
        window.renderizarDetalheNotificacao(id);
        window.ViewManager.goTo('detalheNotificacaoView');
      }
    });
  });
}

async function renderizarHistorico(container) {
  const historico = await obterHistoricoVerificacoes(apostaJogoAtual, false);
  if (!historico.length) {
    container.innerHTML = '<div class="no-notifications">📭 Nenhum histórico disponível</div>';
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
        <div class="notification-resumo ${det.ganhou ? '' : 'sem-premio'}">${escapeHTML(item.resumo)}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.notification-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (typeof window.renderizarDetalheNotificacao === 'function') {
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
