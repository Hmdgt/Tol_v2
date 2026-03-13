// ===============================
// 📊 ESTATÍSTICAS
// ===============================

// Usar configuração global
const ESTATISTICAS_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.ESTATISTICAS}`;
const HISTORICO_API = `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.FICHEIROS.HISTORICO}`;

let estatisticasData = null;
let historicoData = null;
let abaAtiva = 'global';          // 'global' ou nome do jogo
let periodoAtivo = 'mensal';      // 'mensal' ou 'anual'
let anoSelecionado = 'todos';     // 'todos' ou ano específico (ex: '2026')
let modoAtivo = 'resumo';          // 'resumo' ou 'premiados'

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
            if (res.status === 404) return null;
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

// ---------- CARREGAR HISTÓRICO DE NOTIFICAÇÕES (para premiados) ----------
async function carregarHistorico() {
    const token = localStorage.getItem("github_token");
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
        const res = await fetch(HISTORICO_API + `?t=${Date.now()}`, { headers });
        if (!res.ok) {
            if (res.status === 404) return [];
            throw new Error(`Erro ${res.status}`);
        }
        const data = await res.json();
        const jsonText = base64ToString(data.content);
        return JSON.parse(jsonText);
    } catch (err) {
        console.error("Erro ao carregar histórico:", err);
        return [];
    }
}

// ---------- FILTRAR DADOS POR ANO ----------
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

    container.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon><p>A carregar estatísticas...</p></div>';

    // Carregar dados conforme o modo
    if (modoAtivo === 'resumo') {
        estatisticasData = await carregarEstatisticas();
        if (!estatisticasData) {
            container.innerHTML = '<div class="error">❌ Não foi possível carregar estatísticas. Verifica se o ficheiro existe e o token tem permissões.</div>';
            return;
        }
        if (Object.keys(estatisticasData).length === 0) {
            container.innerHTML = '<div class="no-notifications">📊 Nenhuma estatística disponível.</div>';
            return;
        }
    } else {
        historicoData = await carregarHistorico();
        if (!historicoData || historicoData.length === 0) {
            container.innerHTML = '<div class="no-notifications">📭 Nenhum boletim premiado encontrado.</div>';
            return;
        }
    }

    const anos = obterAnosDisponiveis();

    // Construir HTML com abas de modo (Resumo / Premiados)
    let html = `
        <div class="estatisticas-header">
            <h2>Estatísticas</h2>
            <div class="modo-tabs" style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 10px;">
                <button class="modo-btn ${modoAtivo === 'resumo' ? 'active' : ''}" data-modo="resumo">📊 Resumo</button>
                <button class="modo-btn ${modoAtivo === 'premiados' ? 'active' : ''}" data-modo="premiados">🏆 Premiados</button>
            </div>
    `;

    if (modoAtivo === 'resumo') {
        // Abas de período
        html += `<div class="periodo-tabs">
                <button class="periodo-btn ${periodoAtivo === 'mensal' ? 'active' : ''}" data-periodo="mensal">Mensal</button>
                <button class="periodo-btn ${periodoAtivo === 'anual' ? 'active' : ''}" data-periodo="anual">Anual</button>
            </div>`;

        // Seletor de anos
        if (anos.length > 1) {
            html += `<div class="ano-tabs" style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 10px;">`;
            html += `<button class="ano-btn ${anoSelecionado === 'todos' ? 'active' : ''}" data-ano="todos">Todos</button>`;
            anos.forEach(ano => {
                html += `<button class="ano-btn ${anoSelecionado === ano ? 'active' : ''}" data-ano="${ano}">${ano}</button>`;
            });
            html += `</div>`;
        }

        // Abas de jogos
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
        html += `</div>`;

        html += `<div class="estatisticas-conteudo" style="overflow-x: auto;">`;

        // Aplicar filtro de ano
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
        }

        // Conteúdo conforme aba e período
        if (abaAtiva === 'global') {
            html += gerarTabelaGlobal(periodoAtivo, dadosFiltrados.global);
        } else {
            const dadosJogo = periodoAtivo === 'mensal' ? dadosFiltrados.mensal?.[abaAtiva] : dadosFiltrados.anual?.[abaAtiva];
            html += gerarTabelaJogo(periodoAtivo, dadosJogo, abaAtiva);
        }

        html += `</div>`;
    } else {
        // Modo premiados
        html += `<div class="premiados-conteudo">`;
        html += gerarListaPremiados(historicoData);
        html += `</div>`;
    }

    container.innerHTML = html;

    // Event listeners para os botões de modo
    document.querySelectorAll('.modo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modoAtivo = btn.dataset.modo;
            renderizarEstatisticas();
        });
    });

    if (modoAtivo === 'resumo') {
        document.querySelectorAll('.periodo-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                periodoAtivo = btn.dataset.periodo;
                renderizarEstatisticas();
            });
        });

        document.querySelectorAll('.jogo-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                abaAtiva = btn.dataset.jogo;
                renderizarEstatisticas();
            });
        });

        document.querySelectorAll('.ano-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                anoSelecionado = btn.dataset.ano;
                renderizarEstatisticas();
            });
        });
    }
}

// ---------- GERAR TABELA GLOBAL (igual ao original) ----------
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

// ---------- GERAR TABELA POR JOGO (igual ao original) ----------
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

// ---------- GERAR LISTA DE BOLETINS PREMIADOS ----------
function gerarListaPremiados(dados) {
    // Filtrar apenas os que ganharam
    const premiados = dados.filter(item => item.detalhes?.ganhou === true);
    
    if (premiados.length === 0) {
        return '<p class="no-data">Nenhum boletim premiado encontrado.</p>';
    }

    // Ordenar por data (mais recente primeiro)
    premiados.sort((a, b) => new Date(b.data) - new Date(a.data));

    let html = `<div class="premiados-lista" style="display: flex; flex-direction: column; gap: 12px;">`;

    for (const p of premiados) {
        const jogo = p.jogo || p._jogo || 'desconhecido';
        const data = formatarData(p.data);
        const concurso = p.detalhes?.sorteio?.concurso || p.detalhes?.boletim?.concurso_sorteio || '-';
        const premio = p.detalhes?.premio?.categoria || p.detalhes?.premio?.premio || 'Prémio';
        const valor = p.detalhes?.premio?.valor || '€ 0,00';
        const referencia = p.detalhes?.boletim?.referencia || '-';

        // Construir descrição dos números/código
        let numeros = '';
        if (jogo === 'milhao') {
            numeros = `Código: ${p.detalhes?.aposta?.codigo || '-'}`;
        } else {
            const nums = p.detalhes?.aposta?.numeros;
            if (nums) {
                numeros = nums.join(' ');
                if (p.detalhes?.aposta?.estrelas) {
                    numeros += ` + ${p.detalhes.aposta.estrelas.join(' ')}`;
                }
                if (p.detalhes?.aposta?.dream_number) {
                    numeros += ` Dream: ${p.detalhes.aposta.dream_number}`;
                }
                if (p.detalhes?.aposta?.numero_da_sorte) {
                    numeros += ` Nº Sorte: ${p.detalhes.aposta.numero_da_sorte}`;
                }
            } else {
                numeros = '-';
            }
        }

        html += `
            <div class="premiado-card" style="background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="background: #2a5a2a; padding: 4px 12px; border-radius: 20px; font-weight: bold; color: white;">${jogo.toUpperCase()}</span>
                    <span style="color: #ffd700; font-weight: bold;">${premio}</span>
                </div>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: 14px;">
                    <span style="color: #888;">Data:</span><span>${data}</span>
                    <span style="color: #888;">Concurso:</span><span>${concurso}</span>
                    <span style="color: #888;">Referência:</span><span>${referencia}</span>
                    <span style="color: #888;">Aposta:</span><span>${numeros}</span>
                    <span style="color: #888;">Prémio:</span><span class="valor-premio" style="color: #ffd700;">${valor}</span>
                </div>
            </div>
        `;
    }

    html += `</div>`;
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
