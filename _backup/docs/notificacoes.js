// ===== CONFIGURAÇÃO =====
const REPO = "Hmdgt/Tol_v2";
const CAMINHO_NOTIFICACOES = "resultados/notificacoes_ativas.json";
const CAMINHO_HISTORICO = "resultados/notificacoes_historico.json";

// Usamos a API para leitura de escrita para garantir 0% de cache
const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO_NOTIFICACOES}`;
const GITHUB_HISTORICO_API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO_HISTORICO}`;

// ===== FUNÇÕES AUXILIARES =====

// Função robusta para ler ficheiros do GitHub sem cache
async function lerFicheiroGitHub(urlApi) {
    const token = localStorage.getItem("github_token");
    const headers = { 'Cache-Control': 'no-cache' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(urlApi + `?t=${Date.now()}`, { headers });
    if (!res.ok) return { content: [], sha: null };
    
    const data = await res.json();
    return {
        content: JSON.parse(atob(data.content)),
        sha: data.sha
    };
}

// ===== FUNÇÕES PRINCIPAIS =====

// 1. Carregar notificações (Sempre frescas)
async function carregarNotificacoes() {
    try {
        const { content } = await lerFicheiroGitHub(GITHUB_API);
        return content;
    } catch (error) {
        console.error('Erro ao carregar notificações:', error);
        return [];
    }
}

// 2. Atualizar badge
async function atualizarBadge() {
    const notificacoes = await carregarNotificacoes();
    const naoLidas = notificacoes.filter(n => !n.lido).length;
    
    localStorage.setItem('notificacoes_naoLidas', naoLidas);
    
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (naoLidas > 0) {
            badge.style.display = 'flex';
            badge.textContent = naoLidas > 99 ? '99+' : naoLidas;
        } else {
            badge.style.display = 'none';
        }
    }
    return notificacoes;
}

// 3. Marcar como lida (Com proteção contra duplicação no histórico)
async function marcarComoLida(idNotificacao) {
    const token = localStorage.getItem("github_token");
    if (!token) {
        alert("Token não configurado.");
        return false;
    }

    try {
        // --- 1. ATUALIZAR ATIVAS ---
        const fAtivas = await lerFicheiroGitHub(GITHUB_API);
        const notificacaoLida = fAtivas.content.find(n => n.id === idNotificacao);
        
        if (!notificacaoLida) {
            console.warn('Notificação já não está nas ativas.');
            return true; // Consideramos sucesso pois já não está lá
        }

        const novasAtivas = fAtivas.content.filter(n => n.id !== idNotificacao);

        const resUpdateAtivas = await fetch(GITHUB_API, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `✅ Lida: ${idNotificacao}`,
                content: btoa(JSON.stringify(novasAtivas, null, 2)),
                sha: fAtivas.sha
            })
        });

        if (!resUpdateAtivas.ok) throw new Error('Falha ao atualizar ativas');

        // --- 2. ADICIONAR AO HISTÓRICO (Com Verificação de Duplicados) ---
        const fHist = await lerFicheiroGitHub(GITHUB_HISTORICO_API);
        let historico = fHist.content;

        // SÓ ADICIONA SE O ID NÃO EXISTIR NO HISTÓRICO
        const jaExisteNoHist = historico.some(n => n.id === idNotificacao);
        
        if (!jaExisteNoHist) {
            notificacaoLida.lido = true;
            notificacaoLida.data_leitura = new Date().toISOString();
            historico.push(notificacaoLida);

            await fetch(GITHUB_HISTORICO_API, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `📚 Histórico: ${idNotificacao}`,
                    content: btoa(JSON.stringify(historico, null, 2)),
                    sha: fHist.sha
                })
            });
        }

        await atualizarBadge();
        return true;
    } catch (error) {
        console.error('Erro na operação:', error);
        return false;
    }
}

// 4. Renderizar (Filtro rigoroso)
async function renderizarNotificacoes() {
    const listaElement = document.getElementById('notificationsList');
    if (!listaElement) return;

    listaElement.innerHTML = '<div class="loading">Buscando resultados...</div>';
    
    const notificacoes = await carregarNotificacoes();
    const naoLidas = notificacoes.filter(n => !n.lido);

    if (naoLidas.length === 0) {
        listaElement.innerHTML = '<div class="no-notifications">✨ Tudo limpo!</div>';
        return;
    }

    listaElement.innerHTML = naoLidas.map(notif => `
        <div class="notification-card" data-id="${notif.id}">
            <div class="notification-header">
                <ion-icon name="notifications-outline" class="jogo-icon"></ion-icon>
                <span class="jogo-nome">${notif.jogo}</span>
                <span class="unread-badge">Nova</span>
                <span class="notification-date">${new Date(notif.data).toLocaleDateString('pt-PT')}</span>
            </div>
            <div class="notification-title">${notif.titulo}</div>
            <div class="notification-subtitle">${notif.subtitulo}</div>
            <div class="notification-resumo">${notif.resumo}</div>
        </div>
    `).join('');

    // Eventos de clique
    document.querySelectorAll('.notification-card').forEach(card => {
        card.addEventListener('click', async () => {
            const id = card.dataset.id;
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';

            if (await marcarComoLida(id)) {
                card.remove();
                if (document.querySelectorAll('.notification-card').length === 0) {
                    listaElement.innerHTML = '<div class="no-notifications">✨ Tudo limpo!</div>';
                }
            } else {
                card.style.opacity = '1';
                card.style.pointerEvents = 'auto';
            }
        });
    });
}

// 6. Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    if (window.location.pathname.includes('notificacoes.html')) {
        await renderizarNotificacoes();
    }
    await atualizarBadge();
    setInterval(atualizarBadge, 60000); // 1 minuto é suficiente com a API
});
