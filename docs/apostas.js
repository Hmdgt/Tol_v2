// ===============================
// 🎫 VIEW APOSTAS (Pendentes, Premiados, Histórico)
// ===============================

// Variáveis de estado da view
let apostaJogoAtual = 'global';
let apostaAbaAtual = 'pendentes'; // 'pendentes' | 'premiados' | 'historico'

// ---------- FUNÇÕES DE LEITURA DE DADOS (REUTILIZANDO EXISTENTES) ----------

// Obtém pendentes (não confirmados) – baseado na lógica original de listarBoletinsPorValidar
async function obterApostasPendentes(jogoFiltro) {
  const tipos = CONFIG.TIPOS_JOGO.filter(t => jogoFiltro === 'global' || t === jogoFiltro);
  const pendentes = [];

  for (const tipo of tipos) {
    const caminho = `apostas/${tipo}.json`;
    const { content } = await carregarFicheiroGitHub(caminho);
    if (content && Array.isArray(content)) {
      const naoConfirmados = content.filter(j => !j.confirmado);
      pendentes.push(...naoConfirmados.map(j => ({ ...j, _tipo_arquivo: tipo })));
    }
  }
  return pendentes;
}

// Obtém histórico de verificações (todas ou premiadas) a partir do ficheiro de histórico
async function obterHistoricoVerificacoes(jogoFiltro, apenasPremiados = false) {
  const { content } = await lerFicheiroGitHub(CONFIG.FICHEIROS.HISTORICO);
  let itens = content || [];
  if (jogoFiltro !== 'global') {
    itens = itens.filter(item => item.jogo === jogoFiltro);
  }
  if (apenasPremiados) {
    itens = itens.filter(item => item.detalhes?.ganhou && !item.arquivado);
  }
  // Ordena por data decrescente
  itens.sort((a, b) => new Date(b.data) - new Date(a.data));
  return itens;
}

// ---------- RENDERIZADORES ----------

async function renderizarPendentes(container) {
  const pendentes = await obterApostasPendentes(apostaJogoAtual);
  if (pendentes.length === 0) {
    container.innerHTML = '<div class="no-notifications">✅ Nenhum boletim pendente</div>';
    return;
  }

  // Agrupa por imagem (para apresentar como card único)
  const agrupado = {};
  pendentes.forEach(p => {
    const img = p.imagem_origem;
    if (!agrupado[img]) {
      agrupado[img] = { imagem: img, tipo: p._tipo_arquivo, boletins: [] };
    }
    agrupado[img].boletins.push(p);
  });

  container.innerHTML = Object.values(agrupado).map(grupo => {
    const tipo = grupo.tipo;
    const logoHTML = getLogoHTMLNotificacao(tipo);
    const ref = grupo.boletins[0].referencia_unica || grupo.imagem;
    const total = grupo.boletins.length;
    return `
      <div class="notification-card validacao-card" data-imagem="${escapeHTML(grupo.imagem)}">
        <div class="validacao-card-header">
          ${logoHTML}
          <span class="validacao-imagem">${escapeHTML(ref)}</span>
          <span class="validacao-badge">${total}</span>
        </div>
        <div class="validacao-tipos">${escapeHTML(tipo)}</div>
        <div class="validacao-preview">Clique para validar</div>
      </div>
    `;
  }).join('');

  // Evento para abrir validação (reutiliza função global existente)
  container.querySelectorAll('.validacao-card').forEach(card => {
    card.addEventListener('click', () => {
      const img = card.dataset.imagem;
      if (typeof window.abrirValidacao === 'function') {
        window.abrirValidacao(img);
      }
    });
  });
}

async function renderizarPremiados(container) {
  const premiados = await obterHistoricoVerificacoes(apostaJogoAtual, true);
  if (premiados.length === 0) {
    container.innerHTML = '<div class="no-notifications">🏆 Nenhum prémio por confirmar</div>';
    return;
  }

  container.innerHTML = premiados.map(item => {
    const det = item.detalhes;
    const logoHTML = getLogoHTMLNotificacao(item.jogo);
    const bloco = gerarBlocoInline(det.aposta, det.sorteio, det.acertos, normalizarJogo(item.jogo));
    const dataFormatada = formatarData(item.data);
    return `
      <div class="notification-card" data-id="${escapeHTML(item.id)}">
        <div class="notification-header">
          ${logoHTML}
          <span class="notification-date">${escapeHTML(dataFormatada)}</span>
        </div>
        <div class="numeros-aposta" style="justify-content: flex-start;">${bloco}</div>
        <div class="notification-resumo">${escapeHTML(item.resumo)}</div>
        <button class="btn-arquivar" data-id="${escapeHTML(item.id)}">Confirmar leitura</button>
      </div>
    `;
  }).join('');

  // Evento para arquivar (confirmação de leitura)
  container.querySelectorAll('.btn-arquivar').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (await marcarComoLida(id)) {  // reutiliza função existente que move para histórico e marca lida
        // recarrega a lista
        renderizarPremiados(container);
      }
    });
  });

  // Clique no card abre detalhes
  container.querySelectorAll('.notification-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      // Podemos reutilizar a função de detalhes de notificações
      if (typeof window.renderizarDetalheNotificacao === 'function') {
        window.renderizarDetalheNotificacao(id);
        window.ViewManager.goTo('detalheNotificacaoView');
      }
    });
  });
}

async function renderizarHistorico(container) {
  const historico = await obterHistoricoVerificacoes(apostaJogoAtual, false);
  if (historico.length === 0) {
    container.innerHTML = '<div class="no-notifications">📭 Nenhum histórico disponível</div>';
    return;
  }

  container.innerHTML = historico.map(item => {
    const det = item.detalhes;
    const logoHTML = getLogoHTMLNotificacao(item.jogo);
    const bloco = gerarBlocoInline(det.aposta, det.sorteio, det.acertos, normalizarJogo(item.jogo));
    const dataFormatada = formatarData(item.data);
    return `
      <div class="notification-card" data-id="${escapeHTML(item.id)}">
        <div class="notification-header">
          ${logoHTML}
          <span class="notification-date">${escapeHTML(dataFormatada)}</span>
        </div>
        <div class="numeros-aposta" style="justify-content: flex-start;">${bloco}</div>
        <div class="notification-resumo ${det.ganhou ? '' : 'sem-premio'}">${escapeHTML(item.resumo)}</div>
      </div>
    `;
  }).join('');

  // Clique no card leva ao detalhe (igual às notificações)
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

// ---------- CONTROLO DA VIEW (chamada pelo ViewManager) ----------
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

// ---------- CONFIGURAÇÃO DE EVENTOS DA INTERFACE (dropdown e abas) ----------
document.addEventListener('DOMContentLoaded', () => {
  // Dropdown de jogo
  const select = document.getElementById('apostasJogoSelect');
  if (select) {
    select.addEventListener('change', (e) => {
      apostaJogoAtual = e.target.value;
      window.carregarApostasView();
    });
  }

  // Abas
  document.querySelectorAll('#apostasView .periodo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Destacar aba ativa
      document.querySelectorAll('#apostasView .periodo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      apostaAbaAtual = btn.dataset.tab;
      window.carregarApostasView();
    });
  });

  // Garantir que a aba ativa inicial está destacada
  const abaInicial = document.querySelector(`#apostasView .periodo-btn[data-tab="${apostaAbaAtual}"]`);
  if (abaInicial) abaInicial.classList.add('active');
});

// Nota: As funções dependentes (lerFicheiroGitHub, gerarBlocoInline, etc.) já estão disponíveis globalmente.
