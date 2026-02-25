// ===== CONFIGURAÇÃO =====
const REPO = "Hmdgt/Tol_v2";
const CAMINHO_NOTIFICACOES = "resultados/notificacoes_ativas.json";
const CAMINHO_HISTORICO = "resultados/notificacoes_historico.json";
const GITHUB_RAW = `https://raw.githubusercontent.com/${REPO}/main/${CAMINHO_NOTIFICACOES}`;
const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO_NOTIFICACOES}`;
const GITHUB_HISTORICO_API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO_HISTORICO}`;

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
    
    // Guardar no localStorage para resposta rápida
    localStorage.setItem('notificacoes_naoLidas', naoLidas);
    localStorage.setItem('notificacoes_timestamp', Date.now());
    
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
        // ===== 1. ATUALIZAR NOTIFICAÇÕES ATIVAS =====
        const res = await fetch(GITHUB_API, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            console.error('Erro ao buscar ficheiro:', await res.text());
            return false;
        }
        
        const ficheiro = await res.json();
        let notificacoes = JSON.parse(atob(ficheiro.content));
        
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
            console.error('Erro ao atualizar ativas:', await updateRes.text());
            return false;
        }
        
        // ===== 2. ADICIONAR AO HISTÓRICO =====
        let historico = [];
        let shaHist = null;
        
        try {
            const resHist = await fetch(GITHUB_HISTORICO_API, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (resHist.ok) {
                const ficheiroHist = await resHist.json();
                historico = JSON.parse(atob(ficheiroHist.content));
                shaHist = ficheiroHist.sha;
            }
        } catch (e) {
            console.log('Histórico ainda não existe, vai ser criado');
        }
        
        // Adicionar notificação lida ao histórico
        historico.push(notificacaoLida);
        
        // Atualizar histórico
        await fetch(GITHUB_HISTORICO_API, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Notificação ${idNotificacao} adicionada ao histórico`,
                content: btoa(JSON.stringify(historico, null, 2)),
                sha: shaHist
            })
        });
        
        console.log('✅ Notificação movida para o histórico');
        
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
            
            console.log('🔍 Clicou na notificação:', id, 'lido:', lido);
            
            if (!lido) {
                // Desativar clique duplo
                card.style.pointerEvents = 'none';
                
                // Marcar como lida no GitHub
                const resultado = await marcarComoLida(id);
                
                if (resultado) {
                    // Remover o card da lista (já não está nas ativas)
                    card.remove();
                    
                    // Se não houver mais cards, mostrar mensagem
                    if (document.querySelectorAll('.notification-card').length === 0) {
                        document.getElementById('notificationsList').innerHTML = 
                            '<div class="no-notifications">✨ Nenhuma notificação</div>';
                    }
                    
                    console.log('✅ Notificação removida da lista');
                } else {
                    // Reativar clique se falhou
                    card.style.pointerEvents = 'auto';
                }
            }
        });
    });
}

// 5. Verificar token ao carregar
function verificarToken() {
    const token = localStorage.getItem("github_token");
    if (!token) {
        // Mostrar aviso subtil
        const aviso = document.createElement('div');
        aviso.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 10px;
            border-radius: 8px;
            text-align: center;
            font-size: 14px;
            z-index: 1000;
        `;
        aviso.innerHTML = '⚠️ Token não configurado. <a href="config.html" style="color: #ffd700;">Configurar</a>';
        document.body.appendChild(aviso);
        
        // Remover após 5 segundos
        setTimeout(() => aviso.remove(), 5000);
    }
    return token;
}

// 6. Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando sistema de notificações');
    
    // Verificar token (não obrigatório para ver, só para marcar)
    verificarToken();
    
    // Se estiver na página de notificações
    if (window.location.pathname.includes('notificacoes.html')) {
        await renderizarNotificacoes();
    }
    
    // Sempre atualizar badge (em qualquer página)
    await atualizarBadge();
    
    // Atualizar badge periodicamente (a cada 30 segundos)
    setInterval(atualizarBadge, 30000);
});
