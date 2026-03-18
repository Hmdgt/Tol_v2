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
let modoAtivo = 'resumo';          // 'resumo', 'premiados' ou 'pendentes'

// --- Variáveis para seleção na aba premiados ---
let modoSelecao = false;           // true quando estamos em modo de seleção
let itensSelecionados = new Set(); // guarda os ids dos itens selecionados
let longPressTimer = null;         // timer para detectar long press

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

// ---------- FORMATAR DATA (para exibição) ----------
function formatarData(dataStr) {
    if (!dataStr) return '-';
    // Se vier no formato ISO (YYYY-MM-DD)
    if (dataStr.includes('-')) {
        const [ano, mes, dia] = dataStr.split(' ')[0].split('-');
        return `${dia}/${mes}/${ano}`;
    }
    // Se vier no formato DD/MM/YYYY
    if (dataStr.includes('/')) return dataStr;
    return dataStr;
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

// ---------- CARREGAR HISTÓRICO DE NOTIFICAÇÕES ----------
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

// ---------- CARREGAR TODAS AS APOSTAS DA PASTA /apostas/ ----------
async function carregarTodasApostas() {
    const token = localStorage.getItem("github_token");
    if (!token) {
        console.warn("Token não configurado. Não é possível carregar apostas.");
        return [];
    }

    const headers = { Authorization: `Bearer ${token}` };
    const pasta = CONFIG.PASTAS.APOSTAS; // "apostas/"

    try {
        // 1. Listar ficheiros na pasta via API
        const listRes = await fetch(`https://api.github.com/repos/${CONFIG.REPO}/contents/${pasta}?t=${Date.now()}`, { headers });
        if (!listRes.ok) {
            console.error("Erro ao listar pasta apostas:", listRes.status);
            return [];
        }
        const ficheiros = await listRes.json();

        // 2. Filtrar apenas ficheiros .json que correspondam a tipos de jogo (ignora cota_por_chave.json)
        const tiposJogo = CONFIG.TIPOS_JOGO; // ['euromilhoes','totoloto','eurodreams','milhao']
        const jsonFiles = ficheiros.filter(f => 
            f.name.endsWith('.json') && 
            f.type === 'file' &&
            tiposJogo.some(tipo => f.name.startsWith(tipo)) // assume que os ficheiros começam com o nome do jogo
        );

        // 3. Para cada ficheiro, buscar o conteúdo usando a API (não raw) para evitar CORS
        const todasApostas = [];
        for (const file of jsonFiles) {
            const contentRes = await fetch(`https://api.github.com/repos/${CONFIG.REPO}/contents/${file.path}?t=${Date.now()}`, { headers });
            if (!contentRes.ok) continue;
            const data = await contentRes.json();
            const jsonText = base64ToString(data.content);
            try {
                const conteudo = JSON.parse(jsonText);
                if (Array.isArray(conteudo)) {
                    conteudo.forEach(item => {
                        todasApostas.push({
                            ...item,
                            _tipo_ficheiro: file.name.replace('.json', '')
                        });
                    });
                } else {
                    console.warn(`Ficheiro ${file.name} não é um array, ignorado.`);
                }
            } catch (e) {
                console.error(`Erro ao parsear JSON do ficheiro ${file.name}:`, e);
            }
        }

        return todasApostas;
    } catch (err) {
        console.error("Erro ao carregar apostas:", err);
        return [];
    }
}

// ---------- ATUALIZAR HISTÓRICO NO GITHUB (com flag arquivado) ----------
async function atualizarHistorico(novoHistorico) {
    const token = localStorage.getItem("github_token");
    if (!token) {
        ToastManager.mostrar("Token não configurado.", "erro");
        return false;
    }

    try {
        // Primeiro, obtém o SHA atual do ficheiro
        const res = await fetch(HISTORICO_API + `?t=${Date.now()}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`Erro ao obter SHA: ${res.status}`);
        const data = await res.json();
        const sha = data.sha;

        // Prepara o conteúdo atualizado
        const conteudo = JSON.stringify(novoHistorico, null, 2);
        const base64 = stringToBase64(conteudo);

        const putRes = await fetch(HISTORICO_API, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: "Arquivar prémios selecionados",
                content: base64,
                sha: sha
            })
        });

        if (putRes.ok) {
            ToastManager.mostrar("Prémios arquivados com sucesso.", "sucesso");
            return true;
        } else {
            const err = await putRes.json();
            console.error("Erro ao guardar histórico:", err);
            ToastManager.mostrar("Erro ao arquivar prémios.", "erro");
            return false;
        }
    } catch (err) {
        console.error("Erro ao atualizar histórico:", err);
        ToastManager.mostrar("Erro de rede ao arquivar.", "erro");
        return false;
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

// ---------- GERAR CARD PADRÃO (estilo notificações) ----------
function gerarCardPadrao(opcoes) {
    const {
        id,
        jogo,
        estado,          // texto do badge (ex: "PREMIADO", "PENDENTE")
        corBadge,        // cor de fundo do badge (ex: "#ffd700", "#ffaa00")
        icon,            // nome do ícone (ex: "trophy-outline", "time-outline")
        dataSorteio,
        titulo,          // concurso + referência
        resumo,          // prémio + valor / números + valor
        selecionado = false,
        onclick = null
    } = opcoes;

    const selecionadoClass = selecionado ? 'selecionado' : '';
    const dataFormatada = formatarData(dataSorteio);

    return `
        <div class="notification-card ${selecionadoClass}" 
             data-id="${escapeHTML(id)}" 
             style="${selecionado ? 'border-color: #ffd700; background: #222;' : ''}"
             ${onclick ? `onclick="${onclick}"` : ''}>
            <div class="notification-header">
                <ion-icon name="${icon}" class="jogo-icon"></ion-icon>
                <span class="jogo-nome">${escapeHTML(jogo.toUpperCase())}</span>
                <span class="unread-badge" style="background: ${corBadge}">${escapeHTML(estado)}</span>
                <span class="notification-date">${escapeHTML(dataFormatada)}</span>
            </div>
            <div class="notification-title">${escapeHTML(titulo)}</div>
            <div class="notification-resumo">${escapeHTML(resumo)}</div>
        </div>
    `;
}

// ---------- GERAR LISTA DE PREMIADOS (com seleção e estilo unificado) ----------
function gerarListaPremiadosInterativa(dados) {
    // Filtrar apenas os que ganharam e NÃO estão arquivados
    const premiados = dados.filter(item => item.detalhes?.ganhou === true && !item.arquivado);

    if (premiados.length === 0) {
        return '<p class="no-data">Nenhum boletim premiado encontrado.</p>';
    }

    // Ordenar por data do sorteio (mais recente primeiro)
    premiados.sort((a, b) => {
        const dataA = a.detalhes?.sorteio?.data || a.detalhes?.boletim?.data_sorteio || a.data;
        const dataB = b.detalhes?.sorteio?.data || b.detalhes?.boletim?.data_sorteio || b.data;
        return new Date(dataB) - new Date(dataA);
    });

    let html = '';

    // Barra de ações (aparece apenas em modo de seleção)
    if (modoSelecao) {
        html += `
            <div class="selecao-barra" style="display: flex; gap: 10px; margin-bottom: 15px; padding: 10px; background: #222; border-radius: 8px; align-items: center;">
                <span style="flex: 1; color: #ffd700;">${itensSelecionados.size} selecionado(s)</span>
                <button id="btnCancelarSelecao" class="btn-cancelar" style="padding: 8px 12px;">Cancelar</button>
                <button id="btnArquivarSelecionados" class="btn-validar" style="padding: 8px 12px;">
                    <ion-icon name="archive-outline"></ion-icon> Arquivar
                </button>
            </div>
        `;
    }

    html += `<div class="premiados-lista" style="display: flex; flex-direction: column; gap: 12px;">`;

    for (const p of premiados) {
        const id = p.id;
        const selecionado = itensSelecionados.has(id);
        const jogo = p.jogo || p._jogo || 'desconhecido';
        
        // DATA DO SORTEIO
        const dataSorteio = p.detalhes?.sorteio?.data || p.detalhes?.boletim?.data_sorteio || p.data;

        // TÍTULO = concurso + referência
        const concurso = p.detalhes?.sorteio?.concurso || p.detalhes?.boletim?.concurso_sorteio || '-';
        const referencia = p.detalhes?.boletim?.referencia || '-';
        const titulo = `Conc. ${concurso} • Ref. ${referencia}`;

        // RESUMO = prémio + valor
        let categorias = [];
        let valorTotal = 0;

        if (p.detalhes?.premios && Array.isArray(p.detalhes.premios)) {
            p.detalhes.premios.forEach(prem => {
                if (prem && prem.premio) categorias.push(prem.premio);
                let valorStr = prem?.valor?.replace('€', '').replace(' ', '').replace(',', '.') || '0';
                if (valorStr.includes('Reembolso')) valorStr = '1.0';
                const num = parseFloat(valorStr);
                if (!isNaN(num)) valorTotal += num;
            });
        } else if (p.detalhes?.premio) {
            const prem = p.detalhes.premio;
            if (prem.categoria || prem.premio) categorias.push(prem.categoria || prem.premio);
            let valorStr = prem?.valor?.replace('€', '').replace(' ', '').replace(',', '.') || '0';
            if (valorStr.includes('Reembolso')) valorStr = '1.0';
            const num = parseFloat(valorStr);
            if (!isNaN(num)) valorTotal += num;
        }

        if (categorias.length === 0) categorias.push('Prémio');
        const categoriasStr = categorias.join(' + ');
        const valorTotalStr = `€ ${valorTotal.toFixed(2).replace('.', ',')}`;
        const resumo = `${categoriasStr} • ${valorTotalStr}`;

        // Ícone baseado no jogo
        let icon = 'trophy-outline';
        if (jogo === 'euromilhoes') icon = 'star-outline';
        else if (jogo === 'totoloto') icon = 'grid-outline';
        else if (jogo === 'eurodreams') icon = 'moon-outline';
        else if (jogo === 'milhao') icon = 'cash-outline';

        html += gerarCardPadrao({
            id,
            jogo,
            estado: 'PREMIADO',
            corBadge: '#ffd700',
            icon,
            dataSorteio,
            titulo,
            resumo,
            selecionado,
            onclick: null // o clique é gerido pelo listener próprio (long press)
        });
    }

    html += `</div>`;
    return html;
}

// ---------- GERAR LISTA DE PENDENTES (sem seleção, estilo unificado) ----------
function gerarListaPendentes(apostas) {
    if (!apostas || apostas.length === 0) {
        return '<p class="no-data">Nenhum boletim pendente encontrado.</p>';
    }

    // Ordenar por data do sorteio (mais próximo primeiro)
    apostas.sort((a, b) => new Date(a.data_sorteio) - new Date(b.data_sorteio));

    let html = '<div class="pendentes-lista" style="display: flex; flex-direction: column; gap: 12px;">';

    for (const aposta of apostas) {
        const jogo = aposta.tipo || aposta._tipo_ficheiro || 'desconhecido';
        const dataSorteio = aposta.data_sorteio;
        const concurso = aposta.concurso || '-';
        const referencia = aposta.referencia_unica || '-';
        const titulo = `Conc. ${concurso} • Ref. ${referencia}`;

        // Construir resumo com números
        let numeros = '';
        if (aposta.apostas && Array.isArray(aposta.apostas)) {
            const primeira = aposta.apostas[0];
            if (primeira) {
                if (primeira.numeros) {
                    numeros = primeira.numeros.join(' ');
                    if (primeira.estrelas) numeros += ` + ${primeira.estrelas.join(' ')}`;
                    if (primeira.dream_number) numeros += ` Dream: ${primeira.dream_number}`;
                    if (primeira.numero_da_sorte) numeros += ` Nº Sorte: ${primeira.numero_da_sorte}`;
                } else if (primeira.codigo) {
                    numeros = `Código: ${primeira.codigo}`;
                }
            }
        } else if (aposta.numeros) {
            numeros = aposta.numeros.join(' ');
            if (aposta.estrelas) numeros += ` + ${aposta.estrelas.join(' ')}`;
        }

        const valor = aposta.valor_total || 1.0;
        const resumo = numeros || 'Aposta';

        // Ícone baseado no jogo
        let icon = 'time-outline';
        if (jogo === 'euromilhoes') icon = 'star-outline';
        else if (jogo === 'totoloto') icon = 'grid-outline';
        else if (jogo === 'eurodreams') icon = 'moon-outline';
        else if (jogo === 'milhao') icon = 'cash-outline';

        html += gerarCardPadrao({
            id: aposta.referencia_unica || aposta.id,
            jogo,
            estado: 'PENDENTE',
            corBadge: '#ffaa00',
            icon,
            dataSorteio,
            titulo,
            resumo,
            selecionado: false,
            onclick: null // sem clique por enquanto (podes adicionar se quiseres)
        });
    }

    html += '</div>';
    return html;
}

// ---------- INICIALIZAR LONG PRESS NOS CARDS (apenas premiados) ----------
function inicializarLongPressCards() {
    const cards = document.querySelectorAll('.notification-card[data-id]'); // seleciona todos os cards
    cards.forEach(card => {
        // Usar touch events para mobile
        card.addEventListener('touchstart', (e) => {
            longPressTimer = setTimeout(() => {
                entrarModoSelecao(card);
            }, 600);
        });

        card.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
        });

        card.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        });

        card.addEventListener('touchcancel', () => {
            clearTimeout(longPressTimer);
        });

        card.addEventListener('click', (e) => {
            // Só entra em modo de seleção se estivermos na aba premiados e o card for de premiado
            // Como a função só é chamada na aba premiados, podemos prosseguir
            if (modoSelecao) {
                const id = card.dataset.id;
                if (itensSelecionados.has(id)) {
                    itensSelecionados.delete(id);
                    card.style.borderColor = '#333';
                    card.style.background = '#1a1a1a';
                } else {
                    itensSelecionados.add(id);
                    card.style.borderColor = '#ffd700';
                    card.style.background = '#222';
                }
                const barra = document.querySelector('.selecao-barra span');
                if (barra) {
                    barra.textContent = `${itensSelecionados.size} selecionado(s)`;
                }
            }
        });
    });
}

// ---------- ENTRAR EM MODO DE SELEÇÃO ----------
function entrarModoSelecao(card) {
    if (modoSelecao) return;
    modoSelecao = true;
    itensSelecionados.clear();
    const id = card.dataset.id;
    itensSelecionados.add(id);
    card.style.borderColor = '#ffd700';
    card.style.background = '#222';
    renderizarEstatisticas(); // Recria a lista com a barra
}

// ---------- SAIR DO MODO DE SELEÇÃO ----------
function sairModoSelecao() {
    modoSelecao = false;
    itensSelecionados.clear();
    renderizarEstatisticas();
}

// ---------- ARQUIVAR SELECIONADOS ----------
async function arquivarSelecionados() {
    if (itensSelecionados.size === 0) {
        ToastManager.mostrar("Nenhum item selecionado.", "info");
        return;
    }

    const historicoAtual = await carregarHistorico();
    if (!historicoAtual) return;

    const novoHistorico = historicoAtual.map(item => {
        if (itensSelecionados.has(item.id)) {
            return { ...item, arquivado: true };
        }
        return item;
    });

    const sucesso = await atualizarHistorico(novoHistorico);
    if (sucesso) {
        modoSelecao = false;
        itensSelecionados.clear();
        historicoData = novoHistorico;
        renderizarEstatisticas();
    }
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
            container.innerHTML = '<div class="error">Não foi possível carregar estatísticas. Verifica se o ficheiro existe e o token tem permissões.</div>';
            return;
        }
        if (Object.keys(estatisticasData).length === 0) {
            container.innerHTML = '<div class="no-notifications">Nenhuma estatística disponível.</div>';
            return;
        }
    } else {
        historicoData = await carregarHistorico();
        if (!historicoData || historicoData.length === 0) {
            container.innerHTML = '<div class="no-notifications">Nenhum boletim no histórico.</div>';
            return;
        }
    }

    const anos = obterAnosDisponiveis();

    // Construir HTML com abas de modo
    let html = `
        <div class="estatisticas-header">
            <div class="modo-tabs" style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 10px;">
                <button class="modo-btn ${modoAtivo === 'resumo' ? 'active' : ''}" data-modo="resumo">Resumo</button>
                <button class="modo-btn ${modoAtivo === 'premiados' ? 'active' : ''}" data-modo="premiados">Premiados</button>
                <button class="modo-btn ${modoAtivo === 'pendentes' ? 'active' : ''}" data-modo="pendentes">Pendentes</button>
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
        html += `<div class="jogo-tabs"><button class="jogo-btn ${abaAtiva === 'global' ? 'active' : ''}" data-jogo="global">Global</button>`;

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
    } else if (modoAtivo === 'premiados') {
        html += gerarListaPremiadosInterativa(historicoData);
    } else if (modoAtivo === 'pendentes') {
        // Modo pendentes – carrega apostas e filtra as que não estão no histórico
        const [apostas, historico] = await Promise.all([
            carregarTodasApostas(),
            Promise.resolve(historicoData) // já está carregado
        ]);

        // Criar um Set com as referências únicas que já estão no histórico
        const refsHistorico = new Set();
        historico.forEach(item => {
            const ref = item.detalhes?.boletim?.referencia || item.id || item.referencia_unica;
            if (ref) refsHistorico.add(ref);
        });

        // Filtrar apostas que NÃO estão no histórico
        const pendentes = apostas.filter(aposta => {
            const refAposta = aposta.referencia_unica || aposta.id;
            return !refsHistorico.has(refAposta);
        });

        html += gerarListaPendentes(pendentes);
    }

    container.innerHTML = html;

    // Event listeners para os botões de modo
    document.querySelectorAll('.modo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modoAtivo = btn.dataset.modo;
            // Sair do modo de seleção ao mudar de aba
            modoSelecao = false;
            itensSelecionados.clear();
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
    } else if (modoAtivo === 'premiados') {
        inicializarLongPressCards();
        const btnArquivar = document.getElementById('btnArquivarSelecionados');
        if (btnArquivar) {
            btnArquivar.addEventListener('click', arquivarSelecionados);
        }
        const btnCancelar = document.getElementById('btnCancelarSelecao');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', sairModoSelecao);
        }
    }
    // Na aba pendentes não há listeners específicos
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
