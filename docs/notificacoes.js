// ===== CONFIGURAÇÃO =====
const REPO = "Hmdgt/Tol_v2";
const CAMINHO_NOTIFICACOES = "resultados/notificacoes_ativas.json";
const GITHUB_RAW = `https://raw.githubusercontent.com/${REPO}/main/${CAMINHO_NOTIFICACOES}`;
const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO_NOTIFICACOES}`;

// ===== FUNÇÕES PRINCIPAIS =====

// 1. Carregar notificações
async function carregarNotificacoes() {
    try {
        const response = await fetch(GITHUB_RAW + `?t=${Date.now()}`); // Evitar cache
        if (!response.ok) throw new Error('Erro ao carregar');
        return await response.json();
    } catch (error) {
        console.error('Erro:', error);
        return [];
    }
}

// 2. Atualizar badge no index.html
async function atualizarBadge() {
    const notificacoes = await carregarNotificacoes();
    const naoLidas = notificacoes.filter(n => !n.lido).length;
    
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

// 3. Marcar notificação como lida (via API GitHub)
async function marcarComoLida(idNotificacao) {
    const token = localStorage.getItem("github_token");
    if (!token) {
        alert("Token não configurado. Vai às Configurações.");
        return false;
    }
    
    try {
        // Buscar ficheiro atual para obter SHA
        const res = await fetch(GITHUB_API, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            console.error('Erro ao buscar ficheiro:', await res.text());
            return false;
        }
        
        const ficheiro = await res.json();
        let notificacoes = JSON.parse(atob(ficheiro.content));
        
        // Filtrar removendo a lida
        const notificacaoLida = notificacoes.find(n => n.id === idNotificacao);
        const novasAtivas = notificacoes.filter(n => n.id !== idNotificacao);
        
        if (!notificacaoLida) {
            console.log('Notificação não encontrada');
            return false;
        }
        
        // Marcar como lida e adicionar timestamp
        notificacaoLida.lido = true;
        notificacaoLida.data_leitura = new Date().toISOString();
        
        // Atualizar notificações ativas (remover a lida)
        const updateRes = await fetch(GITHUB_API, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Notificação ${idNotificacao} marcada como lida`,
                content: btoa(JSON.stringify(novasAtivas, null, 2)),
                sha: ficheiro.sha
            })
        });
        
        if (!updateRes.ok) {
            console.error('Erro ao atualizar:', await updateRes.text());
            return false;
        }
        
        console.log('✅ Notificação marcada como lida');
        
        // Atualizar badge
        await atualizarBadge();
        
        return true;
    } catch (error) {
        console.error('Erro ao marcar como lida:', error);
        return false;
    }
}

// 4. Renderizar lista de notificações
async function renderizarNotificacoes() {
    const listaElement = document.getElementById('notificationsList');
    if (!listaElement) return;
    
    const notificacoes = await carregarNotificacoes();
    const naoLidas = notificacoes.filter(n => !n.lido);
    
    if (notificacoes.length === 0) {
        listaElement.innerHTML = '<div class="no-notifications">✨ Nenhuma notificação</div>';
        return;
    }
    
    let html = '';
    for (const notif of notificacoes) {
        const naoLida = !notif.lido ? '<span class="unread-badge">Nova</span>' : '';
        
        html += `
            <div class="notification-card" data-id="${notif.id}" data-lido="${notif.lido}">
                <div class="notification-header">
                    <ion-icon name="notifications-outline" class="jogo-icon"></ion-icon>
                    <span class="jogo-nome">${notif.jogo || 'Jogo'}</span>
                    ${naoLida}
                    <span class="notification-date">${new Date(notif.data).toLocaleDateString('pt-PT')}</span>
                </div>
                <div class="notification-title">${notif.titulo || 'Novo resultado'}</div>
                <div class="notification-subtitle">${notif.subtitulo || ''}</div>
                <div class="notification-resumo">${notif.resumo || 'Ver detalhes'}</div>
            </div>
        `;
    }
    
    listaElement.innerHTML = html;
    
    // Adicionar eventos de clique
    document.querySelectorAll('.notification-card').forEach(card => {
        card.addEventListener('click', async () => {
            const id = card.dataset.id;
            const lido = card.dataset.lido === 'true';
            
            if (!lido) {
                // Marcar como lida
                await marcarComoLida(id);
                // Remover card (ou atualizar visual)
                card.style.opacity = '0.5';
                card.querySelector('.unread-badge')?.remove();
                card.dataset.lido = 'true';
                
                // Opcional: mostrar toast ou feedback
                console.log('Notificação marcada como lida');
            }
            
            // Aqui podes abrir uma página de detalhe se quiseres
            // window.location = `detalhe.html?id=${id}`;
        });
    });
}

// 5. Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // Se estiver na página de notificações
    if (window.location.pathname.includes('notificacoes.html')) {
        await renderizarNotificacoes();
    }
    
    // Sempre atualizar badge (em qualquer página)
    await atualizarBadge();
    
    // Atualizar badge periodicamente (a cada 60 segundos)
    setInterval(atualizarBadge, 60000);
});
