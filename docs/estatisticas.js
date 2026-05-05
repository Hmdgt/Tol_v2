// ===============================
// 📊 ESTATÍSTICAS
// ===============================

const ESTATISTICAS_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.ESTATISTICAS}`;
const HISTORICO_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.HISTORICO}`;

let estatisticasData = null;
let historicoData = null;
let abaAtiva = 'global';
let periodoAtivo = 'mensal';
let anoSelecionado = 'todos';
let modoAtivo = 'resumo';         // 'resumo' ou 'sorteios'

// ---------- FUNÇÃO DE NORMALIZAÇÃO DE JOGOS ----------
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

// ---------- FUNÇÃO PARA OBTER LOGO DO JOGO ----------
function getLogoHTML(jogo) {
    const jogoNormalizado = normalizarJogo(jogo);
    if (jogoNormalizado === 'euromilhoes') return '<div class="logo-sprite logo-euromilhoes">Euromilhões</div>';
    if (jogoNormalizado === 'totoloto') return '<div class="logo-sprite logo-totoloto">Totoloto</div>';
    if (jogoNormalizado === 'eurodreams') return '<div class="logo-sprite logo-eurodreams">EuroDreams</div>';
    if (jogoNormalizado === 'milhao') return '<div class="logo-sprite logo-milhao">M1lhão</div>';
    return `<span class="logo-placeholder">${escapeHTML(jogoNormalizado.toUpperCase())}</span>`;
}

// ---------- FORMATAÇÕES ----------
function formatarMoeda(valor) {
    if (valor === undefined || valor === null) return '-';
    return valor.toFixed(2).replace('.', ',');
}

function formatarMes(mesAno) {
    const [ano, mes] = mesAno.split('-');
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return meses[parseInt(mes)-1];
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

// ---------- OBTER ANOS DISPONÍVEIS ----------
function obterAnosDisponiveis() {
    if (!estatisticasData || !estatisticasData.mensal) return [];
    const anosSet = new Set();
    for (const jogo in estatisticasData.mensal) {
        Object.keys(estatisticasData.mensal[jogo] || {}).forEach(mes => anosSet.add(mes.substring(0,4)));
    }
    if (estatisticasData.global?.mensal) {
        Object.keys(estatisticasData.global.mensal).forEach(mes => anosSet.add(mes.substring(0,4)));
    }
    return Array.from(anosSet).sort();
}

// ---------- CARREGAR DADOS ----------
async function carregarEstatisticas() {
    const token = localStorage.getItem("github_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
        const res = await fetch(ESTATISTICAS_API + `?t=${Date.now()}`, { headers });
        if (!res.ok) return res.status === 404 ? null : (() => { throw new Error(`Erro ${res.status}`); })();
        const data = await res.json();
        return JSON.parse(base64ToString(data.content));
    } catch (err) {
        console.error("Erro ao carregar estatísticas:", err);
        return null;
    }
}

async function carregarHistorico() {
    const token = localStorage.getItem("github_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
        const res = await fetch(HISTORICO_API + `?t=${Date.now()}`, { headers });
        if (!res.ok) return res.status === 404 ? [] : (() => { throw new Error(`Erro ${res.status}`); })();
        const data = await res.json();
        return JSON.parse(base64ToString(data.content));
    } catch (err) {
        console.error("Erro ao carregar histórico:", err);
        return [];
    }
}

// ---------- CARREGAR SORTEIOS OFICIAIS ----------
async function carregarSorteios(jogo, ano) {
    const token = localStorage.getItem("github_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    // Mapear jogo -> prefixo do ficheiro (sem extensão)
    const mapa = {
        totoloto: 'totoloto_sc',
        euromilhoes: 'euromilhoes',
        eurodreams: 'eurodreams',
        milhao: 'milhao'
    };
    const prefixo = mapa[jogo];
    if (!prefixo) return [];

    // Tentar primeiro o ficheiro específico do ano: ex: totoloto_sc_2026.json
    const caminho = `dados/${prefixo}_${ano}.json`;
    try {
        const url = `https://api.github.com/repos/${CONFIG.REPO}/contents/${caminho}?t=${Date.now()}`;
        const res = await fetch(url, { headers });
        if (res.ok) {
            const data = await res.json();
            const conteudo = JSON.parse(base64ToString(data.content));
            // A estrutura esperada é { "2026": [ ... ] }
            if (conteudo && conteudo[ano] && Array.isArray(conteudo[ano])) {
                return conteudo[ano];
            }
            // Fallback: se for um array diretamente
            if (Array.isArray(conteudo)) return conteudo;
        }
    } catch (e) {
        console.warn(`Erro ao carregar ${caminho}`, e);
    }

    // Se não encontrou, podemos tentar o ficheiro "atual" para esse jogo (ex: totoloto_sc_atual.json)
    const caminhoAtual = `dados/${prefixo}_atual.json`;
    try {
        const url = `https://api.github.com/repos/${CONFIG.REPO}/contents/${caminhoAtual}?t=${Date.now()}`;
        const res = await fetch(url, { headers });
        if (res.ok) {
            const data = await res.json();
            const conteudo = JSON.parse(base64ToString(data.content));
            if (conteudo && conteudo[ano] && Array.isArray(conteudo[ano])) {
                return conteudo[ano];
            }
            if (Array.isArray(conteudo)) return conteudo;
        }
    } catch (e) {
        console.warn(`Erro ao carregar ${caminhoAtual}`, e);
    }

    console.warn(`Nenhum ficheiro de sorteios encontrado para ${jogo} ${ano}`);
    return [];
}

// ---------- FILTRAR POR ANO ----------
function filtrarPorAno(dados, periodo, ano) {
    if (ano === 'todos' || !dados) return dados;
    if (!dados[periodo]) return dados;
    const filtrado = {};
    for (const chave in dados[periodo]) {
        if (chave.startsWith(ano)) filtrado[chave] = dados[periodo][chave];
    }
    return { [periodo]: filtrado };
}

// ---------- GERAR TABELA GLOBAL ----------
function gerarTabelaGlobal(periodo, dadosGlobais) {
    if (!dadosGlobais || !dadosGlobais[periodo] || Object.keys(dadosGlobais[periodo]).length === 0)
        return '<p class="no-data">Sem dados globais disponíveis para este período.</p>';

    const periodos = Object.keys(dadosGlobais[periodo]).sort().reverse();
    let html = `<table class="estatisticas-tabela"><thead><th>${periodo === 'mensal' ? 'Mês' : 'Ano'}</th>
        <th>Apostas</th><th>Gasto (€)</th><th>Recebido (€)</th><th>Saldo (€)</th>
        <th>Ganhadoras</th><th>% Ganho</th><th>Maior prémio (€)</th><th>Data</th></thead><tbody>`;

    for (const pk of periodos) {
        const d = dadosGlobais[periodo][pk];
        html += `<tr>
            <td><strong>${periodo === 'mensal' ? formatarMes(pk) : pk}</strong></td>
            <td>${d.total_apostas}</td>
            <td>${formatarMoeda(d.total_gasto)}</td>
            <td>${formatarMoeda(d.total_recebido)}</td>
            <td class="${d.saldo >= 0 ? 'positivo' : 'negativo'}">${formatarMoeda(d.saldo)}</td>
            <td>${d.ganhadoras}</td>
            <td>${d.percentagem_ganhadoras?.toFixed(1) ?? '0'}%</td>
            <td>${formatarMoeda(d.maior_premio)}</td>
            <td>${d.data_maior_premio || '-'}</td>
        </tr>`;
    }
    return html + '</tbody></table>';
}

// ---------- GERAR TABELA POR JOGO ----------
function gerarTabelaJogo(periodo, dadosJogo, jogo) {
    if (!dadosJogo || Object.keys(dadosJogo).length === 0)
        return '<p class="no-data">Sem dados disponíveis para este jogo neste período.</p>';

    const periodos = Object.keys(dadosJogo).sort().reverse();
    let html = `<table class="estatisticas-tabela"><thead><th>${periodo === 'mensal' ? 'Mês' : 'Ano'}</th>
        <th>Apostas</th><th>Gasto (€)</th><th>Recebido (€)</th><th>Saldo (€)</th>
        <th>Ganhadoras</th><th>% Ganho</th><th>Maior prémio (€)</th>
        <th>Média prémios (€)</th><th>Mediana prémios (€)</th>
        <th>Média acertos nº</th><th>Média acertos esp.</th></thead><tbody>`;

    for (const pk of periodos) {
        const d = dadosJogo[pk];
        html += `<tr>
            <td><strong>${periodo === 'mensal' ? formatarMes(pk) : pk}</strong></td>
            <td>${d.total_apostas}</td>
            <td>${formatarMoeda(d.total_gasto)}</td>
            <td>${formatarMoeda(d.total_recebido)}</td>
            <td class="${d.saldo >= 0 ? 'positivo' : 'negativo'}">${formatarMoeda(d.saldo)}</td>
            <td>${d.ganhadoras}</td>
            <td>${d.percentagem_ganhadoras?.toFixed(1) ?? '0'}%</td>
            <td>${formatarMoeda(d.maior_premio)}</td>
            <td>${formatarMoeda(d.media_premios)}</td>
            <td>${formatarMoeda(d.mediana_premios)}</td>
            <td>${d.media_acertos_numeros?.toFixed(2) ?? '0'}</td>
            <td>${d.media_acertos_especial?.toFixed(2) ?? '0'}</td>
        </tr>`;
    }
    return html + '</tbody></table>';
}

// ---------- RENDERIZAR SORTEIOS OFICIAIS ----------
async function renderizarSorteios(container, jogo, ano) {
    container.innerHTML = '<div class="loading"><ion-icon name="sync-outline"></ion-icon></div>';
    const sorteios = await carregarSorteios(jogo, ano);
    if (!sorteios.length) {
        container.innerHTML = '<p class="no-data">Nenhum sorteio encontrado para este ano.</p>';
        return;
    }

    // Ordenar por concurso (decrescente)
    sorteios.sort((a, b) => {
        const numA = parseInt(a.concurso) || 0;
        const numB = parseInt(b.concurso) || 0;
        return numB - numA;
    });

    const logoHTML = getLogoHTML(jogo); // Logo do jogo selecionado

    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    for (const s of sorteios) {
        let chaveHTML = '';

        // Tratamento por tipo de jogo
        switch (jogo) {
            case 'totoloto':
                if (s.numeros && Array.isArray(s.numeros)) {
                    chaveHTML += s.numeros.map(n => `<span class="numero-santacas">${String(n).padStart(2,'0')}</span>`).join('');
                    if (s.especial !== undefined) {
                        chaveHTML += '<span class="separador-mais">+</span>';
                        chaveHTML += `<span class="estrela-santacas">${String(s.especial).padStart(2,'0')}</span>`;
                    }
                }
                break;

            case 'euromilhoes':
                if (s.chave) {
                    const partes = s.chave.split('+').map(p => p.trim());
                    if (partes.length >= 2) {
                        const numeros = partes[0].split(/\s+/).filter(n => n);
                        const estrelas = partes[1].split(/\s+/).filter(e => e);
                        chaveHTML += numeros.map(n => `<span class="numero-santacas">${String(n).padStart(2,'0')}</span>`).join('');
                        chaveHTML += '<span class="separador-mais">+</span>';
                        chaveHTML += estrelas.map(e => `<span class="estrela-santacas">${String(e).padStart(2,'0')}</span>`).join('');
                    } else {
                        chaveHTML = `<span>${escapeHTML(s.chave)}</span>`;
                    }
                }
                break;

            case 'eurodreams':
                if (s.numeros && Array.isArray(s.numeros)) {
                    chaveHTML += s.numeros.map(n => `<span class="numero-santacas">${String(n).padStart(2,'0')}</span>`).join('');
                    if (s.dream !== undefined) {
                        chaveHTML += '<span class="separador-mais">+</span>';
                        chaveHTML += `<span class="estrela-santacas">${String(s.dream).padStart(2,'0')}</span>`;
                    }
                }
                break;

            case 'milhao':
                if (s.codigo) {
                    chaveHTML = `<span class="codigo-milhao">${escapeHTML(s.codigo)}</span>`;
                }
                break;

            default:
                chaveHTML = '<span>Sem dados</span>';
        }

        if (!chaveHTML) {
            chaveHTML = '<span>Sem dados</span>';
        }

        html += `
            <div class="notification-card" style="cursor: default;">
                <div class="notification-header">
                    ${logoHTML}
                    <span class="jogo-nome">${escapeHTML(s.concurso || s.data)}</span>
                    <span class="notification-date">${escapeHTML(formatarData(s.data))}</span>
                </div>
                <div class="numeros-aposta" style="justify-content: flex-start;">${chaveHTML}</div>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
}

// ---------- RENDERIZAR ESTATÍSTICAS (REESTRUTURADA) ----------
async function renderizarEstatisticas() {
  const container = document.getElementById('estatisticasContainer');
  if (!container) return;

  container.innerHTML = '<div class="loading"><ion-icon name="sync-outline"></ion-icon><p>A carregar...</p></div>';

  // Para a aba Resumo precisamos das estatísticas
  if (modoAtivo === 'resumo') {
    estatisticasData = await carregarEstatisticas();
    if (!estatisticasData) {
      container.innerHTML = '<div class="error">Não foi possível carregar estatísticas.</div>';
      return;
    }
    if (Object.keys(estatisticasData).length === 0) {
      container.innerHTML = '<div class="no-notifications">Nenhuma estatística disponível.</div>';
      return;
    }
  }

  const anos = obterAnosDisponiveis();

  // Construir cabeçalho com as duas abas: Resumo e Sorteios
  let html = `
    <div class="estatisticas-header">
      <div class="modo-tabs">
        <button class="modo-btn ${modoAtivo === 'resumo' ? 'active' : ''}" data-modo="resumo">Resumo</button>
        <button class="modo-btn ${modoAtivo === 'sorteios' ? 'active' : ''}" data-modo="sorteios">Sorteios</button>
      </div>
  `;

  if (modoAtivo === 'resumo') {
    // Linha 2: dropdown + periodo-tabs (+ anos, se houver)
    html += `<div class="estatisticas-linha">`;

    html += `<div class="jogo-select-container"><select id="jogoSelect" class="jogo-select">
        <option value="global" ${abaAtiva === 'global' ? 'selected' : ''}>Global</option>
        <option value="totoloto" ${abaAtiva === 'totoloto' ? 'selected' : ''}>Totoloto</option>
        <option value="euromilhoes" ${abaAtiva === 'euromilhoes' ? 'selected' : ''}>Euromilhões</option>
        <option value="eurodreams" ${abaAtiva === 'eurodreams' ? 'selected' : ''}>EuroDreams</option>
        <option value="milhao" ${abaAtiva === 'milhao' ? 'selected' : ''}>M1lhão</option>
      </select></div>`;

    html += `<div class="periodo-tabs">
        <button class="periodo-btn ${periodoAtivo === 'mensal' ? 'active' : ''}" data-periodo="mensal">Mensal</button>
        <button class="periodo-btn ${periodoAtivo === 'anual' ? 'active' : ''}" data-periodo="anual">Anual</button>
      </div>`;

    if (anos.length > 1) {
      html += `<div class="ano-tabs"><button class="ano-btn ${anoSelecionado === 'todos' ? 'active' : ''}" data-ano="todos">Todos</button>`;
      anos.forEach(ano => { html += `<button class="ano-btn ${anoSelecionado === ano ? 'active' : ''}" data-ano="${ano}">${ano}</button>`; });
      html += `</div>`;
    }

    html += `</div>`; // fecha .estatisticas-linha

    html += `<div class="estatisticas-conteudo" style="overflow-x: auto;">`;
    
    let dadosFiltrados = estatisticasData;
    if (anoSelecionado !== 'todos') {
      if (abaAtiva === 'global') {
        dadosFiltrados = { ...estatisticasData, global: filtrarPorAno(estatisticasData.global, periodoAtivo, anoSelecionado) };
      } else {
        dadosFiltrados = {
          ...estatisticasData,
          mensal: { ...estatisticasData.mensal, [abaAtiva]: estatisticasData.mensal?.[abaAtiva]
            ? Object.fromEntries(Object.entries(estatisticasData.mensal[abaAtiva]).filter(([mes]) => mes.startsWith(anoSelecionado)))
            : {} },
          anual: { ...estatisticasData.anual, [abaAtiva]: estatisticasData.anual?.[abaAtiva]
            ? Object.fromEntries(Object.entries(estatisticasData.anual[abaAtiva]).filter(([anoKey]) => anoKey === anoSelecionado))
            : {} }
        };
      }
    }

    if (abaAtiva === 'global') {
      html += gerarTabelaGlobal(periodoAtivo, dadosFiltrados.global);
    } else {
      const dadosJogo = periodoAtivo === 'mensal' ? dadosFiltrados.mensal?.[abaAtiva] : dadosFiltrados.anual?.[abaAtiva];
      html += gerarTabelaJogo(periodoAtivo, dadosJogo, abaAtiva);
    }
    html += `</div>`;
  } else if (modoAtivo === 'sorteios') {
    let anosSorteios = anos.length ? anos : ['2025','2026'];
    if (anoSelecionado === 'todos') anoSelecionado = anosSorteios[anosSorteios.length-1] || '2026';
    
    html += `<div class="estatisticas-linha">`;
    html += `<div class="jogo-select-container"><select id="jogoSorteioSelect" class="jogo-select">
        <option value="totoloto" ${abaAtiva === 'totoloto' ? 'selected' : ''}>Totoloto</option>
        <option value="euromilhoes" ${abaAtiva === 'euromilhoes' ? 'selected' : ''}>Euromilhões</option>
        <option value="eurodreams" ${abaAtiva === 'eurodreams' ? 'selected' : ''}>EuroDreams</option>
        <option value="milhao" ${abaAtiva === 'milhao' ? 'selected' : ''}>M1lhão</option>
      </select></div>`;
    html += `<div class="ano-tabs"><button class="ano-btn ${anoSelecionado === 'todos' ? 'active' : ''}" data-ano="todos">Todos</button>`;
    anosSorteios.forEach(ano => { html += `<button class="ano-btn ${anoSelecionado === ano ? 'active' : ''}" data-ano="${ano}">${ano}</button>`; });
    html += `</div>`;
    html += `</div>`; // fecha .estatisticas-linha
    html += `<div id="sorteiosContainer"></div>`;
  }

  container.innerHTML = html;

  // Eventos das abas de modo
  document.querySelectorAll('.modo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modoAtivo = btn.dataset.modo;
      if (modoAtivo === 'sorteios') {
        abaAtiva = 'totoloto';
        anoSelecionado = '2026';
      }
      renderizarEstatisticas();
    });
  });

  if (modoAtivo === 'resumo') {
    document.querySelectorAll('.periodo-btn').forEach(btn => {
      btn.addEventListener('click', () => { periodoAtivo = btn.dataset.periodo; renderizarEstatisticas(); });
    });
    const jogoSelect = document.getElementById('jogoSelect');
    if (jogoSelect) {
      jogoSelect.addEventListener('change', (e) => { abaAtiva = e.target.value; renderizarEstatisticas(); });
    }
    document.querySelectorAll('.ano-btn').forEach(btn => {
      btn.addEventListener('click', () => { anoSelecionado = btn.dataset.ano; renderizarEstatisticas(); });
    });
  } else if (modoAtivo === 'sorteios') {
    const jogoSorteioSelect = document.getElementById('jogoSorteioSelect');
    if (jogoSorteioSelect) {
      jogoSorteioSelect.addEventListener('change', (e) => { abaAtiva = e.target.value; renderizarEstatisticas(); });
    }
    document.querySelectorAll('.ano-btn').forEach(btn => {
      btn.addEventListener('click', () => { anoSelecionado = btn.dataset.ano; renderizarEstatisticas(); });
    });
    const sorteioContainer = document.getElementById('sorteiosContainer');
    if (sorteioContainer) {
      renderizarSorteios(sorteioContainer, abaAtiva, anoSelecionado);
    }
  }
}

window.renderizarEstatisticas = renderizarEstatisticas;

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('estatisticasView').classList.contains('active')) {
        renderizarEstatisticas();
    }
});
