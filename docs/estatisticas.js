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
        // 1. Listar ficheiros na pasta
        const listRes = await fetch(`https://api.github.com/repos/${CONFIG.REPO}/contents/${pasta}?t=${Date.now()}`, { headers });
        if (!listRes.ok) {
            console.error("Erro ao listar pasta apostas:", listRes.status);
            return [];
        }
        const ficheiros = await listRes.json();

        // 2. Filtrar apenas ficheiros .json
        const jsonFiles = ficheiros.filter(f => f.name.endsWith('.json') && f.type === 'file');

        // 3. Para cada ficheiro, buscar o conteúdo e extrair os boletins
        const todasApostas = [];
        for (const file of jsonFiles) {
            const contentRes = await fetch(file.download_url, { headers });
            if (!contentRes.ok) continue;
            const data = await contentRes.json();
            // Se for um array, adiciona cada item com o tipo
            if (Array.isArray(data)) {
                data.forEach(item => {
                    todasApostas.push({
                        ...item,
                        _tipo_ficheiro: file.name.replace('.json', '') // ex: "totoloto"
                    });
                });
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

    // Construir HTML com abas de modo (Resumo / Premiados / Pendentes)
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
        // Modo premiados – usa a função que gera lista interativa
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
            // Tenta obter a referência única do boletim
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
        // Inicializar listeners para long press nos cards da lista de premiados
        inicializarLongPressCards();
        // Listener para o botão de arquivar (se existir)
        const btnArquivar = document.getElementById('btnArquivarSelecionados');
        if (btnArquivar) {
            btnArquivar.addEventListener('click', arquivarSelecionados);
        }
        // Listener para cancelar seleção (se existir)
        const btnCancelar = document.getElementById('btnCancelarSelecao');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', sairModoSelecao);
        }
    }
    // Nota: na aba pendentes não há listeners específicos (apenas visualização)
}

// ---------- GERAR LISTA DE PREMIADOS COM SELEÇÃO (agora com data do sorteio) ----------
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
        
        // DATA DO SORTEIO (corrigido)
        let dataSorteio = p.detalhes?.sorteio?.data || p.detalhes?.boletim?.data_sorteio || p.data;
        dataSorteio = formatarData(dataSorteio);

        const concurso = p.detalhes?.sorteio?.concurso || p.detalhes?.boletim?.concurso_sorteio || '-';
        const referencia = p.detalhes?.boletim?.referencia || '-';

        // --- Processar prémios (pode ser array ou objeto singular) ---
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

        // --- Construir descrição dos números/código ---
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

        const classeCard = `premiado-card ${selecionado ? 'selecionado' : ''}`;

        html += `
            <div class="${classeCard}" data-id="${escapeHTML(id)}" style="background: #1a1a1a; border: 2px solid ${selecionado ? '#ffd700' : '#333'}; border-radius: 12px; padding: 16px; cursor: pointer; transition: 0.2s;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="background: #2a5a2a; padding: 4px 12px; border-radius: 20px; font-weight: bold; color: white;">${jogo.toUpperCase()}</span>
                    <span style="color: #ffd700; font-weight: bold;">${categoriasStr}</span>
                </div>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: 14px;">
                    <span style="color: #888;">Data sorteio:</span><span>${dataSorteio}</span>
                    <span style="color: #888;">Concurso:</span><span>${concurso}</span>
                    <span style="color: #888;">Referência:</span><span>${referencia}</span>
                    <span style="color: #888;">Aposta:</span><span>${numeros}</span>
                    <span style="color: #888;">Prémio:</span><span class="valor-premio" style="color: #ffd700;">${valorTotalStr}</span>
                </div>
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

// ---------- GERAR LISTA DE PENDENTES (apostas não processadas) ----------
function gerarListaPendentes(apostas) {
    if (!apostas || apostas.length === 0) {
        return '<p class="no-data">Nenhum boletim pendente encontrado.</p>';
    }

    // Ordenar por data do sorteio (mais próximo primeiro)
    apostas.sort((a, b) => new Date(a.data_sorteio) - new Date(b.data_sorteio));

    let html = '<div class="pendentes-lista" style="display: flex; flex-direction: column; gap: 12px;">';

    for (const aposta of apostas) {
        const jogo = aposta.tipo || aposta._tipo_ficheiro || 'desconhecido';
        const dataSorteio = formatarData(aposta.data_sorteio);
        const concurso = aposta.concurso || '-';
        const referencia = aposta.referencia_unica || '-';
        const valor = aposta.valor_total || 1.0;

        // Construir descrição dos números
        let numeros = '';
        if (aposta.apostas && Array.isArray(aposta.apostas)) {
            // Geralmente é um array, mas vamos usar a primeira aposta para simplificar
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
            // Caso esteja diretamente no objeto
            numeros = aposta.numeros.join(' ');
            if (aposta.estrelas) numeros += ` + ${aposta.estrelas.join(' ')}`;
        }

        html += `
            <div class="pendente-card" style="background: #1a1a1a; border: 2px solid #ffaa00; border-radius: 12px; padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="background: #ffaa00; padding: 4px 12px; border-radius: 20px; font-weight: bold; color: #000;">${jogo.toUpperCase()}</span>
                    <span style="color: #ffaa00; font-weight: bold;">Aguardando sorteio</span>
                </div>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: 14px;">
                    <span style="color: #888;">Data sorteio:</span><span>${dataSorteio}</span>
                    <span style="color: #888;">Concurso:</span><span>${concurso}</span>
                    <span style="color: #888;">Referência:</span><span>${referencia}</span>
                    <span style="color: #888;">Aposta:</span><span>${numeros || '-'}</span>
                    <span style="color: #888;">Valor:</span><span>€ ${valor.toFixed(2).replace('.', ',')}</span>
                </div>
            </div>
        `;
    }

    html += '</div>';
    return html;
}

// ---------- INICIALIZAR LONG PRESS NOS CARDS ----------
function inicializarLongPressCards() {
    const cards = document.querySelectorAll('.premiado-card');
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
            if (modoSelecao) {
                const id = card.dataset.id;
                if (itensSelecionados.has(id)) {
                    itensSelecionados.delete(id);
                    card.style.borderColor = '#333';
                } else {
                    itensSelecionados.add(id);
                    card.style.borderColor = '#ffd700';
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
