// ===============================
// 📊 ESTATÍSTICAS
// ===============================

// Usar configuração global (assumindo que CONFIG.FICHEIROS.ESTATISTICAS existe)
const ESTATISTICAS_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.ESTATISTICAS}`;

let estatisticasData = null;
let abaAtiva = 'global';        // 'global' ou nome do jogo
let periodoAtivo = 'mensal';    // 'mensal' ou 'anual'
let anoSelecionado = 'todos';   // 'todos' ou ano específico (ex: '2026')

// ---------- FORMATAÇÃO DE MOEDA (vírgula) ----------
function formatarMoeda(valor) {
    if (valor === undefined || valor === null) return '-';
    return valor.toFixed(2).replace('.', ',');
}

// ---------- FORMATAR MÊS (sem ano) ----------
function formatarMes(mesAno) {
    const [ano, mes] = mesAno.split('-');
    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return meses[parseInt(mes) - 1];
}

// ---------- OBTER ANOS DISPONÍVEIS A PARTIR DOS DADOS ----------
function obterAnosDisponiveis() {
    if (!estatisticasData || !estatisticasData.mensal) return [];

    const anosSet = new Set();
    for (const jogo in estatisticasData.mensal) {
        const meses = Object.keys(estatisticasData.mensal[jogo] || {});
        meses.forEach(mes => anosSet.add(mes.substring(0, 4)));
    }
    // Adicionar também anos dos dados globais, se existirem
    if (estatisticasData.global?.mensal) {
        Object.keys(estatisticasData.global.mensal).forEach(mes => anosSet.add(mes.substring(0, 4)));
    }
    return Array.from(anosSet).sort();
}

// ---------- CARREGAR ESTATÍSTICAS ----------
async function carregarEstatisticas() {
    const token = localStorage.getItem("github_token");
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
        const res = await fetch(ESTATISTICAS_API + `?t=${Date.now()}`, { headers });
        if (!res.ok) {
            if (res.status === 404) return null; // ficheiro não existe
            throw new Error(`Erro ${res.status}`);
        }
        const data = await res.json();
        const jsonText = base64ToString(data.content);
        return JSON.parse(jsonText);
    } catch (err) {
        console.error("Erro ao carregar estatísticas:", err);
        return null;
    }
}

// ---------- FILTRAR DADOS POR ANO (se aplicável) ----------
function filtrarPorAno(dados, periodo, ano) {
    if (ano === 'todos' || !dados) return dados;
    if (!dados[periodo]) return dados;

    const filtrado = {};
    for (const chave in dados[periodo]) {
        if (chave.startsWith(ano)) {
            filtrado[chave] = dados[periodo][chave];
        }
    }
    return { [periodo]: filtrado };
}

// ---------- RENDERIZAR ESTATÍSTICAS ----------
async function renderizarEstatisticas() {
    const container = document.getElementById('estatisticasContainer');
    if (!container) return;

    // Mostrar loading imediatamente
    container.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon><p>A carregar estatísticas...</p></div>';

    estatisticasData = await carregarEstatisticas();

    if (!estatisticasData) {
        container.innerHTML = '<div class="error">❌ Não foi possível carregar estatísticas. Verifica se o ficheiro existe e o token tem permissões.</div>';
        return;
    }

    if (Object.keys(estatisticasData).length === 0) {
        container.innerHTML = '<div class="no-notifications">📊 Nenhuma estatística disponível.</div>';
        return;
    }

    const anos = obterAnosDisponiveis();

    // Construir HTML
    let html = `
        <div class="estatisticas-header">
            <h2>Estatísticas</h2>
            <div class="periodo-tabs">
                <button class="periodo-btn ${periodoAtivo === 'mensal' ? 'active' : ''}" data-periodo="mensal">Mensal</button>
                <button class="periodo-btn ${periodoAtivo === 'anual' ? 'active' : ''}" data-periodo="anual">Anual</button>
            </div>
    `;

    // Seletor de anos (só aparece se houver mais de um ano)
    if (anos.length > 1) {
        html += `<div class="ano-tabs" style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 10px;">`;
        html += `<button class="ano-btn ${anoSelecionado === 'todos' ? 'active' : ''}" data-ano="todos">Todos</button>`;
        anos.forEach(ano => {
            html += `<button class="ano-btn ${anoSelecionado === ano ? 'active' : ''}" data-ano="${ano}">${ano}</button>`;
        });
        html += `</div>`;
    }

    html += `<div class="jogo-tabs"><button class="jogo-btn ${abaAtiva === 'global' ? 'active' : ''}" data-jogo="global">🌍 Global</button>`;

    const jogos = ['totoloto', 'euromilhoes', 'eurodreams', 'milhao'];
    const nomesJogo = {
        totoloto: 'Totoloto',
        euromilhoes: 'Euromilhões',
        eurodreams: 'EuroDreams',
        milhao: 'M1lhão'
    };

    for (const jogo of jogos) {
        const temDados = estatisticasData.mensal?.[jogo] || estatisticasData.anual?.[jogo];
        if (temDados) {
            html += `<button class="jogo-btn ${abaAtiva === jogo ? 'active' : ''}" data-jogo="${jogo}">${nomesJogo[jogo]}</button>`;
        }
    }

    html += `</div></div><div class="estatisticas-conteudo" style="overflow-x: auto;">`;

    // Aplicar filtro de ano aos dados (apenas se não for "todos")
    let dadosFiltrados = estatisticasData;
    if (anoSelecionado !== 'todos') {
        if (abaAtiva === 'global') {
            dadosFiltrados = {
                ...estatisticasData,
                global: filtrarPorAno(estatisticasData.global, periodoAtivo, anoSelecionado)
            };
        } else {
            dadosFiltrados = {
                ...estatisticasData,
                mensal: {
                    ...estatisticasData.mensal,
                    [abaAtiva]: estatisticasData.mensal?.[abaAtiva] 
                        ? Object.fromEntries(
                            Object.entries(estatisticasData.mensal[abaAtiva]).filter(([mes]) => mes.startsWith(anoSelecionado))
                          )
                        : {}
                },
                anual: {
                    ...estatisticasData.anual,
                    [abaAtiva]: estatisticasData.anual?.[abaAtiva]
                        ? Object.fromEntries(
                            Object.entries(estatisticasData.anual[abaAtiva]).filter(([ano]) => ano === anoSelecionado)
                          )
                        : {}
                }
            };
        }
    } else {
        dadosFiltrados = estatisticasData;
    }

    // Conteúdo conforme aba e período
    if (abaAtiva === 'global') {
        html += gerarTabelaGlobal(periodoAtivo, dadosFiltrados.global);
    } else {
        const dadosJogo = periodoAtivo === 'mensal' ? dadosFiltrados.mensal?.[abaAtiva] : dadosFiltrados.anual?.[abaAtiva];
        html += gerarTabelaJogo(periodoAtivo, dadosJogo, abaAtiva);
    }

    html += `</div>`;

    container.innerHTML = html;

    // Adicionar event listeners aos botões de período
    document.querySelectorAll('.periodo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            periodoAtivo = btn.dataset.periodo;
            renderizarEstatisticas();
        });
    });

    // Adicionar event listeners aos botões de jogos
    document.querySelectorAll('.jogo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            abaAtiva = btn.dataset.jogo;
            renderizarEstatisticas();
        });
    });

    // Adicionar event listeners aos botões de ano (se existirem)
    document.querySelectorAll('.ano-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            anoSelecionado = btn.dataset.ano;
            renderizarEstatisticas();
        });
    });
}

// ---------- GERAR TABELA GLOBAL ----------
function gerarTabelaGlobal(periodo, dadosGlobais) {
    if (!dadosGlobais || !dadosGlobais[periodo] || Object.keys(dadosGlobais[periodo]).length === 0) {
        return '<p class="no-data">Sem dados globais disponíveis para este período.</p>';
    }

    const periodos = Object.keys(dadosGlobais[periodo]).sort().reverse();
    let html = `<table class="estatisticas-tabela"><thead><tr>`;

    if (periodo === 'mensal') {
        html += `<th>Mês</th>`;
    } else {
        html += `<th>Ano</th>`;
    }
    html += `
        <th>Apostas</th>
        <th>Gasto (€)</th>
        <th>Recebido (€)</th>
        <th>Saldo (€)</th>
        <th>Ganhadoras</th>
        <th>% Ganho</th>
        <th>Maior prémio (€)</th>
        <th>Data</th>
    </tr></thead><tbody>`;

    for (const periodoKey of periodos) {
        const dados = dadosGlobais[periodo][periodoKey];
        html += `<tr>
            <td><strong>${periodo === 'mensal' ? formatarMes(periodoKey) : periodoKey}</strong></td>
            <td>${dados.total_apostas}</td>
            <td>${formatarMoeda(dados.total_gasto)}</td>
            <td>${formatarMoeda(dados.total_recebido)}</td>
            <td class="${dados.saldo >= 0 ? 'positivo' : 'negativo'}">${formatarMoeda(dados.saldo)}</td>
            <td>${dados.ganhadoras}</td>
            <td>${dados.percentagem_ganhadoras?.toFixed(1) ?? '0'}%</td>
            <td>${formatarMoeda(dados.maior_premio)}</td>
            <td>${dados.data_maior_premio ? dados.data_maior_premio : '-'}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    return html;
}

// ---------- GERAR TABELA POR JOGO ----------
function gerarTabelaJogo(periodo, dadosJogo, jogo) {
    if (!dadosJogo || Object.keys(dadosJogo).length === 0) {
        return '<p class="no-data">Sem dados disponíveis para este jogo neste período.</p>';
    }

    const periodos = Object.keys(dadosJogo).sort().reverse();
    let html = `<table class="estatisticas-tabela"><thead><tr>`;

    if (periodo === 'mensal') {
        html += `<th>Mês</th>`;
    } else {
        html += `<th>Ano</th>`;
    }
    html += `
        <th>Apostas</th>
        <th>Gasto (€)</th>
        <th>Recebido (€)</th>
        <th>Saldo (€)</th>
        <th>Ganhadoras</th>
        <th>% Ganho</th>
        <th>Maior prémio (€)</th>
        <th>Média prémios (€)</th>
        <th>Mediana prémios (€)</th>
        <th>Média acertos nº</th>
        <th>Média acertos esp.</th>
    </tr></thead><tbody>`;

    for (const periodoKey of periodos) {
        const dados = dadosJogo[periodoKey];
        html += `<tr>
            <td><strong>${periodo === 'mensal' ? formatarMes(periodoKey) : periodoKey}</strong></td>
            <td>${dados.total_apostas}</td>
            <td>${formatarMoeda(dados.total_gasto)}</td>
            <td>${formatarMoeda(dados.total_recebido)}</td>
            <td class="${dados.saldo >= 0 ? 'positivo' : 'negativo'}">${formatarMoeda(dados.saldo)}</td>
            <td>${dados.ganhadoras}</td>
            <td>${dados.percentagem_ganhadoras?.toFixed(1) ?? '0'}%</td>
            <td>${formatarMoeda(dados.maior_premio)}</td>
            <td>${formatarMoeda(dados.media_premios)}</td>
            <td>${formatarMoeda(dados.mediana_premios)}</td>
            <td>${dados.media_acertos_numeros?.toFixed(2) ?? '0'}</td>
            <td>${dados.media_acertos_especial?.toFixed(2) ?? '0'}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    return html;
}

// ---------- EXPOR FUNÇÃO PARA O APP ----------
window.renderizarEstatisticas = renderizarEstatisticas;

// Inicializar se a view estiver ativa
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('estatisticasView').classList.contains('active')) {
        renderizarEstatisticas();
    }
});
