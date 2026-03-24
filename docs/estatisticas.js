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

// ---------- FUNÇÃO PARA OBTER LOGO DO JOGO ----------
function getLogoHTML(jogo) {
    const jogoLower = (jogo || '').toLowerCase();
    
    if (jogoLower === 'euromilhoes') {
        return '<div class="logo-sprite logo-euromilhoes">Euromilhões</div>';
    } else if (jogoLower === 'totoloto') {
        return '<div class="logo-sprite logo-totoloto">Totoloto</div>';
    } else if (jogoLower === 'eurodreams') {
        return '<div class="logo-sprite logo-eurodreams">EuroDreams</div>';
    } else if (jogoLower === 'milhao' || jogoLower === 'm1lhão') {
        return '<div class="logo-sprite logo-milhao">M1lhão</div>';
    } else {
        return `<span class="logo-placeholder">${escapeHTML(jogo.toUpperCase())}</span>`;
    }
}

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
    if (dataStr.includes('-')) {
        const [ano, mes, dia] = dataStr.split(' ')[0].split('-');
        return `${dia}/${mes}/${ano}`;
    }
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
    const pasta = CONFIG.PASTAS.APOSTAS;

    try {
        const listRes = await fetch(`https://api.github.com/repos/${CONFIG.REPO}/contents/${pasta}?t=${Date.now()}`, { headers });
        if (!listRes.ok) {
            console.error("Erro ao listar pasta apostas:", listRes.status);
            return [];
        }
        const ficheiros = await listRes.json();

        const tiposJogo = CONFIG.TIPOS_JOGO;
        const jsonFiles = ficheiros.filter(f => 
            f.name.endsWith('.json') && 
            f.type === 'file' &&
            tiposJogo.some(tipo => f.name.startsWith(tipo))
        );

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
        const res = await fetch(HISTORICO_API + `?t=${Date.now()}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`Erro ao obter SHA: ${res.status}`);
        const data = await res.json();
        const sha = data.sha;

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

// ---------- GERAR CARD PARA PREMIADOS (sem badge, com data label) ----------
function gerarCardPremiado(opcoes) {
    const {
        id,
        jogo,
        dataSorteio,
        concurso,
        referencia,
        resumo,
        selecionado = false,
        onclick = null
    } = opcoes;

    const selecionadoClass = selecionado ? 'selecionado' : '';
    const dataFormatada = formatarData(dataSorteio);
    const logoHTML = getLogoHTML(jogo);

    return `
        <div class="notification-card ${selecionadoClass}" 
             data-id="${escapeHTML(id)}" 
             style="${selecionado ? 'border-color: #ffd700; background: var(--bg-card-hover);' : ''}"
             ${onclick ? `onclick="${onclick}"` : ''}>
            <div class="notification-header">
                ${logoHTML}
                <span class="notification-date-label">DATA DO SORTEIO:</span>
                <span class="notification-date">${escapeHTML(dataFormatada)}</span>
            </div>
            <div class="notification-info-right">
                <div class="notification-concurso">CONCURSO ${escapeHTML(concurso)}</div>
                <div class="notification-referencia">REF. ${escapeHTML(referencia)}</div>
            </div>
            <div class="notification-resumo">${escapeHTML(resumo)}</div>
        </div>
    `;
}

// ---------- GERAR CARD PADRÃO (para pendentes e outros) ----------
function gerarCardPadrao(opcoes) {
    const {
        id,
        jogo,
        estado,
        corBadge,
        icon,
        dataSorteio,
        titulo,
        resumo,
        selecionado = false,
        onclick = null
    } = opcoes;

    const selecionadoClass = selecionado ? 'selecionado' : '';
    const dataFormatada = formatarData(dataSorteio);
    const logoHTML = getLogoHTML(jogo);

    return `
        <div class="notification-card ${selecionadoClass}" 
             data-id="${escapeHTML(id)}" 
             style="${selecionado ? 'border-color: #ffd700; background: var(--bg-card-hover);' : ''}"
             ${onclick ? `onclick="${onclick}"` : ''}>
            <div class="notification-header">
                ${logoHTML}
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
    const premiados = dados.filter(item => item.detalhes?.ganhou === true && !item.arquivado);

    if (premiados.length === 0) {
        return '<p class="no-data">Nenhum boletim premiado encontrado.</p>';
    }

    premiados.sort((a, b) => {
        const dataA = a.detalhes?.sorteio?.data || a.detalhes?.boletim?.data_sorteio || a.data;
        const dataB = b.detalhes?.sorteio?.data || b.detalhes?.boletim?.data_sorteio || b.data;
        return new Date(dataB) - new Date(dataA);
    });

    let html = '';

    if (modoSelecao) {
        html += `
            <div class="selecao-barra">
                <span>${itensSelecionados.size} SELECIONADO(S)</span>
                <div style="display: flex; gap: 8px;">
                    <button id="btnCancelarSelecao" class="btn-cancelar">CANCELAR</button>
                    <button id="btnArquivarSelecionados" class="btn-validar">ARQUIVAR</button>
                </div>
            </div>
       `;
    }
    

    html += `<div class="premiados-lista">`;

    for (const p of premiados) {
        const id = p.id;
        const selecionado = itensSelecionados.has(id);
        const jogo = p.jogo || p._jogo || 'desconhecido';
        
        const dataSorteio = p.detalhes?.sorteio?.data || p.detalhes?.boletim?.data_sorteio || p.data;
        const concurso = p.detalhes?.sorteio?.concurso || p.detalhes?.boletim?.concurso_sorteio || '-';
        const referencia = p.detalhes?.boletim?.referencia || '-';

        // Calcular resumo do prémio
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

        html += gerarCardPremiado({
            id,
            jogo,
            dataSorteio,
            concurso,
            referencia,
            resumo,
            selecionado,
            onclick: null
        });
    }

    html += `</div>`;
    return html;
}

// ---------- GERAR LISTA DE PENDENTES (sem seleção) ----------
function gerarListaPendentes(apostas) {
    if (!apostas || apostas.length === 0) {
        return '<p class="no-data">Nenhum boletim pendente encontrado.</p>';
    }

    apostas.sort((a, b) => new Date(a.data_sorteio) - new Date(b.data_sorteio));

    let html = '<div class="pendentes-lista">';

    for (const aposta of apostas) {
        const jogo = aposta.tipo || aposta._tipo_ficheiro || 'desconhecido';
        const dataSorteio = aposta.data_sorteio;
        const concurso = aposta.concurso || '-';
        const referencia = aposta.referencia_unica || '-';
        const titulo = `Conc. ${concurso} • Ref. ${referencia}`;

        let numeros = '';
        if (aposta.apostas && Array.isArray(aposta.apostas)) {
            const primeira = aposta.apostas[0];
            if (primeira) {
                if (primeira.numeros) {
                    numeros = primeira.numeros.join(' ');
                    if (primeira.estrelas) numeros += ` + ${primeira.estrelas.join(' ')}`;
                    if (primeira.dream) numeros += ` Dream: ${primeira.dream}`;
                    if (primeira.numero_da_sorte) numeros += ` Nº Sorte: ${primeira.numero_da_sorte}`;
                } else if (primeira.codigo) {
                    numeros = `Código: ${primeira.codigo}`;
                }
            }
        } else if (aposta.numeros) {
            numeros = aposta.numeros.join(' ');
            if (aposta.estrelas) numeros += ` + ${aposta.estrelas.join(' ')}`;
        }

        const resumo = numeros || 'Aposta';

        html += gerarCardPadrao({
            id: aposta.referencia_unica || aposta.id,
            jogo,
            estado: 'PENDENTE',
            corBadge: '#ffaa00',
            icon: 'time-outline',
            dataSorteio,
            titulo,
            resumo,
            selecionado: false,
            onclick: null
        });
    }

    html += '</div>';
    return html;
}

// ---------- INICIALIZAR LONG PRESS NOS CARDS ----------
function inicializarLongPressCards() {
    const cards = document.querySelectorAll('.notification-card[data-id]');
    cards.forEach(card => {
        let timer = null;
        
        card.addEventListener('touchstart', (e) => {
            timer = setTimeout(() => {
                entrarModoSelecao(card);
            }, 600);
        });

        card.addEventListener('touchend', () => {
            clearTimeout(timer);
        });

        card.addEventListener('touchmove', () => {
            clearTimeout(timer);
        });

        card.addEventListener('touchcancel', () => {
            clearTimeout(timer);
        });

        card.addEventListener('click', (e) => {
            if (modoSelecao) {
                const id = card.dataset.id;
                if (itensSelecionados.has(id)) {
                    itensSelecionados.delete(id);
                    card.style.borderColor = 'var(--border-color)';
                    card.style.background = 'var(--bg-card)';
                } else {
                    itensSelecionados.add(id);
                    card.style.borderColor = '#ffd700';
                    card.style.background = 'var(--bg-card-hover)';
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
    card.style.background = 'var(--bg-card-hover)';
    renderizarEstatisticas();
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

    let html = `
        <div class="estatisticas-header">
            <div class="modo-tabs">
                <button class="modo-btn ${modoAtivo === 'resumo' ? 'active' : ''}" data-modo="resumo">Resumo</button>
                <button class="modo-btn ${modoAtivo === 'premiados' ? 'active' : ''}" data-modo="premiados">Premiados</button>
                <button class="modo-btn ${modoAtivo === 'pendentes' ? 'active' : ''}" data-modo="pendentes">Pendentes</button>
            </div>
    `;

    if (modoAtivo === 'resumo') {
        html += `<div class="periodo-tabs">
                <button class="periodo-btn ${periodoAtivo === 'mensal' ? 'active' : ''}" data-periodo="mensal">Mensal</button>
                <button class="periodo-btn ${periodoAtivo === 'anual' ? 'active' : ''}" data-periodo="anual">Anual</button>
            </div>`;

        if (anos.length > 1) {
            html += `<div class="ano-tabs">`;
            html += `<button class="ano-btn ${anoSelecionado === 'todos' ? 'active' : ''}" data-ano="todos">Todos</button>`;
            anos.forEach(ano => {
                html += `<button class="ano-btn ${anoSelecionado === ano ? 'active' : ''}" data-ano="${ano}">${ano}</button>`;
            });
            html += `</div>`;
        }

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
        const [apostas, historico] = await Promise.all([
            carregarTodasApostas(),
            Promise.resolve(historicoData)
        ]);

        const refsHistorico = new Set();
        historico.forEach(item => {
            const ref = item.detalhes?.boletim?.referencia || item.id || item.referencia_unica;
            if (ref) refsHistorico.add(ref);
        });

        const pendentes = apostas.filter(aposta => {
            const refAposta = aposta.referencia_unica || aposta.id;
            return !refsHistorico.has(refAposta);
        });

        html += gerarListaPendentes(pendentes);
    }

    container.innerHTML = html;

    document.querySelectorAll('.modo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modoAtivo = btn.dataset.modo;
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
}

// ---------- GERAR TABELA GLOBAL ----------
function gerarTabelaGlobal(periodo, dadosGlobais) {
    if (!dadosGlobais || !dadosGlobais[periodo] || Object.keys(dadosGlobais[periodo]).length === 0) {
        return '<p class="no-data">Sem dados globais disponíveis para este período.</p>';
    }

    const periodos = Object.keys(dadosGlobais[periodo]).sort().reverse();
    let html = `<table class="estatisticas-tabela"><thead>`;

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
     </thead><tbody>`;

    for (const periodoKey of periodos) {
        const dados = dadosGlobais[periodo][periodoKey];
        html += `
            <tr>
                <td><strong>${periodo === 'mensal' ? formatarMes(periodoKey) : periodoKey}</strong>\\
                <td>${dados.total_apostas}\\
                <td>${formatarMoeda(dados.total_gasto)}\\
                <td>${formatarMoeda(dados.total_recebido)}\\
                <td class="${dados.saldo >= 0 ? 'positivo' : 'negativo'}">${formatarMoeda(dados.saldo)}\\
                <td>${dados.ganhadoras}\\
                <td>${dados.percentagem_ganhadoras?.toFixed(1) ?? '0'}%\\
                <td>${formatarMoeda(dados.maior_premio)}\\
                <td>${dados.data_maior_premio ? dados.data_maior_premio : '-'}\\
             </tr>
        `;
    }

    html += `</tbody>`;
    return html;
}

// ---------- GERAR TABELA POR JOGO ----------
function gerarTabelaJogo(periodo, dadosJogo, jogo) {
    if (!dadosJogo || Object.keys(dadosJogo).length === 0) {
        return '<p class="no-data">Sem dados disponíveis para este jogo neste período.</p>';
    }

    const periodos = Object.keys(dadosJogo).sort().reverse();
    let html = `<table class="estatisticas-tabela"><thead>`;

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
     </thead><tbody>`;

    for (const periodoKey of periodos) {
        const dados = dadosJogo[periodoKey];
        html += `
            <tr>
                <td><strong>${periodo === 'mensal' ? formatarMes(periodoKey) : periodoKey}</strong>\\
                <td>${dados.total_apostas}\\
                <td>${formatarMoeda(dados.total_gasto)}\\
                <td>${formatarMoeda(dados.total_recebido)}\\
                <td class="${dados.saldo >= 0 ? 'positivo' : 'negativo'}">${formatarMoeda(dados.saldo)}\\
                <td>${dados.ganhadoras}\\
                <td>${dados.percentagem_ganhadoras?.toFixed(1) ?? '0'}%\\
                <td>${formatarMoeda(dados.maior_premio)}\\
                <td>${formatarMoeda(dados.media_premios)}\\
                <td>${formatarMoeda(dados.mediana_premios)}\\
                <td>${dados.media_acertos_numeros?.toFixed(2) ?? '0'}\\
                <td>${dados.media_acertos_especial?.toFixed(2) ?? '0'}\\
              </tr>
        `;
    }

    html += `</tbody>`;
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
