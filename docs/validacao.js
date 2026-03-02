// ===============================
// 🔧 VALIDAÇÃO DE BOLETINS (OCR -> HUMANO)
// ===============================

// Usar configuração global (do config.js)
const PASTA_APOSTAS = CONFIG.PASTAS.APOSTAS;
const PASTA_UPLOADS = CONFIG.PASTAS.UPLOADS;
const PASTA_PREPROCESSADAS = CONFIG.PASTAS.PREPROCESSADAS;

// ---------- CARREGAR FICHEIRO DO GITHUB ----------
async function carregarFicheiroGitHub(caminho) {
  const token = localStorage.getItem("github_token");
  if (!token) return { content: null, sha: null };
  
  const url = `https://api.github.com/repos/${CONFIG.REPO}/contents/${caminho}`;
  
  try {
    const res = await fetch(url + `?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // ✅ Silencia erros 404 (ficheiro não existe)
    if (res.status === 404) return { content: null, sha: null };
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    
    const data = await res.json();
    const jsonText = base64ToString(data.content);
    
    return {
      content: JSON.parse(jsonText),
      sha: data.sha
    };
  } catch (err) {
    // Só mostra erro se não for 404 (o 404 já foi tratado acima)
    if (!err.message.includes('404')) {
      console.error(`Erro ao carregar ${caminho}:`, err);
    }
    return { content: null, sha: null };
  }
}

// ---------- GUARDAR FICHEIRO NO GITHUB ----------
async function guardarFicheiroGitHub(caminho, conteudo, sha, mensagem) {
  const token = localStorage.getItem("github_token");
  if (!token) return false;
  
  const url = `https://api.github.com/repos/${CONFIG.REPO}/contents/${caminho}`;
  
  try {
    const body = {
      message: mensagem,
      content: stringToBase64(JSON.stringify(conteudo, null, 2))
    };
    if (sha) body.sha = sha;
    
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    return res.ok;
  } catch (err) {
    console.error(`Erro ao guardar ${caminho}:`, err);
    return false;
  }
}

// ---------- LISTAR BOLETINS POR VALIDAR ----------
window.listarBoletinsPorValidar = async function() {
  const tipos = CONFIG.TIPOS_JOGO; // Usar configuração global
  const boletinsPorImagem = {};
  
  for (const tipo of tipos) {
    const caminho = `${PASTA_APOSTAS}${tipo}.json`;
    const { content } = await carregarFicheiroGitHub(caminho);
    
    if (content && Array.isArray(content)) {
      // Filtrar apenas não confirmados
      const naoConfirmados = content.filter(jogo => !jogo.confirmado);
      
      for (const jogo of naoConfirmados) {
        const imgOrigem = jogo.imagem_origem;
        if (!boletinsPorImagem[imgOrigem]) {
          boletinsPorImagem[imgOrigem] = [];
        }
        boletinsPorImagem[imgOrigem].push({
          ...jogo,
          tipo_ficheiro: tipo,
          _indice: content.findIndex(j => j.hash_imagem === jogo.hash_imagem)
        });
      }
    }
  }
  
  return boletinsPorImagem;
};

// ---------- CARREGAR IMAGEM DO GITHUB ----------
async function carregarImagemGitHub(caminho) {
  const token = localStorage.getItem("github_token");
  const url = `https://api.github.com/repos/${CONFIG.REPO}/contents/${caminho}`;
  
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    return `data:image/png;base64,${data.content}`;
  } catch (err) {
    console.error("Erro ao carregar imagem:", err);
    return null;
  }
}

// ---------- GUARDAR VALIDAÇÃO (ATUALIZA JSON E MARCA confirmado = true) ----------
async function guardarValidacao(imagem, jogosAtualizados) {
  console.log("💾 A guardar validação para:", imagem);
  
  // Agrupar por tipo de ficheiro
  const porFicheiro = {};
  
  for (const jogo of jogosAtualizados) {
    const tipo = jogo.tipo_ficheiro;
    if (!porFicheiro[tipo]) {
      porFicheiro[tipo] = {
        conteudo: [],
        sha: null,
        jogos: []
      };
    }
    porFicheiro[tipo].jogos.push(jogo);
  }
  
  // Atualizar cada ficheiro
  for (const [tipo, data] of Object.entries(porFicheiro)) {
    const caminho = `${PASTA_APOSTAS}${tipo}.json`;
    
    // Carregar ficheiro completo
    const { content, sha } = await carregarFicheiroGitHub(caminho);
    if (!content) continue;
    
    // Atualizar jogos específicos
    for (const jogoAtualizado of data.jogos) {
      const indice = content.findIndex(j => j.hash_imagem === jogoAtualizado.hash_imagem);
      if (indice !== -1) {
        // Marcar como confirmado e atualizar dados
        content[indice] = {
          ...jogoAtualizado,
          confirmado: true,
          data_validacao: new Date().toISOString(),
          validado_por: "humano"
        };
      }
    }
    
    // Guardar ficheiro
    const sucesso = await guardarFicheiroGitHub(
      caminho,
      content,
      sha,
      `✅ Validação humana: ${imagem}`
    );
    
    if (!sucesso) {
      console.error(`❌ Erro ao guardar ${caminho}`);
      return false;
    }
  }
  
  return true;
}

// ---------- RENDERIZAR LISTA DE BOLETINS POR VALIDAR ----------
window.renderizarListaValidacao = async function() {
  const container = document.getElementById('validacaoContainer');
  if (!container) return;
  
  container.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon></div>';
  
  const boletins = await window.listarBoletinsPorValidar();
  
  if (Object.keys(boletins).length === 0) {
    container.innerHTML = '<div class="no-notifications">✅ Todos os boletins validados!</div>';
    return;
  }
  
  let html = `
    <div class="validacao-header">
      <h2>Boletins por Validar</h2>
      <p class="validacao-subtitle">Toque num boletim para validar</p>
    </div>
    <div class="validacao-lista">
  `;
  
  for (const [imagem, jogos] of Object.entries(boletins)) {
    const totalJogos = jogos.length;
    const tipos = [...new Set(jogos.map(j => j.tipo))].join(', ');
    
    // Escape dos valores
    const imagemEscaped = escapeHTML(imagem);
    const tiposEscaped = escapeHTML(tipos);
    
    html += `
      <div class="validacao-card" data-imagem="${imagemEscaped}">
        <div class="validacao-card-header">
          <ion-icon name="document-text-outline"></ion-icon>
          <span class="validacao-imagem">${imagemEscaped}</span>
          <span class="validacao-badge">${totalJogos}</span>
        </div>
        <div class="validacao-tipos">${tiposEscaped}</div>
        <div class="validacao-preview">📸 Clique para validar</div>
      </div>
    `;
  }
  
  html += '</div>';
  container.innerHTML = html;
  
  // Adicionar event listeners em vez de onclick no HTML
  document.querySelectorAll('.validacao-card').forEach(card => {
    card.addEventListener('click', () => {
      const imagem = card.dataset.imagem;
      window.abrirValidacao(imagem);
    });
  });
};

// ---------- ABRIR VALIDAÇÃO DE UM BOLETIM ----------
window.abrirValidacao = async function(imagem) {
  console.log("📸 A abrir validação:", imagem);
  
  // 1. Mudar para view de validação IMEDIATAMENTE
  if (window.ViewManager) {
    window.ViewManager.goTo('validacaoView');
  } else {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById('validacaoView').classList.add('active');
  }
  
  // 2. Mostrar loading
  const container = document.getElementById('validacaoContainer');
  if (container) {
    container.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon><p>A carregar boletim...</p></div>';
  }
  
  // 3. Carregar dados
  try {
    const boletins = await window.listarBoletinsPorValidar();
    const jogos = boletins[imagem];
    
    if (!jogos) {
      if (container) container.innerHTML = '<div class="error">Boletim não encontrado</div>';
      return;
    }
    
    await renderizarFormValidacao(imagem, jogos);
  } catch (err) {
    console.error('Erro ao abrir validação:', err);
    if (container) container.innerHTML = '<div class="error">Erro ao carregar. Tenta novamente.</div>';
  }
};

// ---------- RENDERIZAR FORMULÁRIO DE VALIDAÇÃO (VERSÃO SIMPLIFICADA) ----------
async function renderizarFormValidacao(imagem, jogos) {
  const container = document.getElementById('validacaoContainer');
  if (!container) return;
  
  // Escape dos valores para segurança
  const imagemEscaped = escapeHTML(imagem);
  
  // Carregar thumbnail (com fallback para original)
  const thumbnailUrl = await carregarImagemGitHub(`thumbnails/${imagem}`);
  const imagemUrl = thumbnailUrl || await carregarImagemGitHub(`uploads/${imagem}`);
  
  let html = `
    <div class="validacao-header">
      <button class="btn-voltar" id="btnVoltarValidacao">
        <ion-icon name="arrow-back-outline"></ion-icon> Voltar
      </button>
      <h3>Validar Boletim</h3>
      <span class="imagem-nome">${imagemEscaped}</span>
    </div>
    
    <div class="validacao-grid">
      <!-- Coluna da Imagem (apenas a thumbnail/original) -->
      <div class="imagem-coluna">
        <div class="imagem-container">
          <img src="${imagemUrl}" alt="Boletim" class="imagem-validacao"
               onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100%25\' height=\'100%25\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%23333\'/%3E%3Ctext x=\'10\' y=\'55\' fill=\'%23888\' font-size=\'10\'%3EImagem não disponível%3C/text%3E%3C/svg%3E';">
        </div>
      </div>
      
      <!-- Coluna dos Formulários -->
      <div class="formularios-coluna">
  `;
  
  // Formulários para cada jogo
  jogos.forEach((jogo, index) => {
    // Escape de valores
    const tipoEscaped = escapeHTML(jogo.tipo);
    const hashEscaped = escapeHTML(jogo.hash_imagem);
    const ficheiroEscaped = escapeHTML(jogo.tipo_ficheiro);
    const refEscaped = escapeHTML(jogo.referencia_unica || '');
    const dataSorteioEscaped = escapeHTML(jogo.data_sorteio || '');
    const concursoEscaped = escapeHTML(jogo.concurso || '');
    
    html += `
      <div class="jogo-form" data-tipo="${tipoEscaped}" data-hash="${hashEscaped}" data-ficheiro="${ficheiroEscaped}">
        <h3>${tipoEscaped} #${index + 1}</h3>
        
        <div class="form-campos">
          <div class="campo">
            <label>Referência Única:</label>
            <input type="text" class="campo-ref" value="${refEscaped}" placeholder="Referência">
          </div>
          
          <div class="campo">
            <label>Data do Sorteio:</label>
            <input type="date" class="campo-data-sorteio" value="${dataSorteioEscaped}">
          </div>
          
          <div class="campo">
            <label>Concurso:</label>
            <input type="text" class="campo-concurso" value="${concursoEscaped}" placeholder="Ex: 016/2026">
          </div>
    `;
    
    // Campos específicos por tipo (apostas)
    if (jogo.apostas && jogo.apostas.length > 0) {
      jogo.apostas.forEach((aposta, idxAposta) => {
        html += `<h4>Aposta ${idxAposta + 1}</h4>`;
        
        if (jogo.tipo === 'M1lhão') {
          const codigoEscaped = escapeHTML(aposta.codigo || '');
          html += `
            <div class="campo">
              <label>Código:</label>
              <input type="text" class="campo-codigo" value="${codigoEscaped}" placeholder="Ex: GTP11668" autocomplete="off">
            </div>
          `;
        } else {
          if (aposta.numeros) {
            html += `
              <div class="campo-numeros">
                <label>Números:</label>
                <div class="numeros-grid">
            `;
            aposta.numeros.forEach((num, i) => {
              const numEscaped = escapeHTML(num);
              html += `<input type="text" class="campo-numero" data-index="${i}" value="${numEscaped}" maxlength="2" placeholder="${i+1}">`;
            });
            html += `</div></div>`;
          }
          
          if (aposta.estrelas) {
            html += `
              <div class="campo-estrelas">
                <label>Estrelas:</label>
                <div class="estrelas-grid">
            `;
            aposta.estrelas.forEach((est, i) => {
              const estEscaped = escapeHTML(est);
              html += `<input type="text" class="campo-estrela" data-index="${i}" value="${estEscaped}" maxlength="2" placeholder="★${i+1}">`;
            });
            html += `</div></div>`;
          }
          
          if (aposta.numero_da_sorte) {
            const sorteEscaped = escapeHTML(aposta.numero_da_sorte);
            html += `
              <div class="campo">
                <label>Nº da Sorte:</label>
                <input type="text" class="campo-sorte" value="${sorteEscaped}" maxlength="2">
              </div>
            `;
          }
        }
      });
    }
    
    html += `
        </div>
        <hr>
      </div>
    `;
  });
  
  html += `
        <div class="botoes-validacao">
          <button class="btn-cancelar" id="btnCancelarValidacao">Cancelar</button>
          <button class="btn-validar" id="btnConfirmarValidacao">
            <ion-icon name="checkmark-circle-outline"></ion-icon> Confirmar Validação
          </button>
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Adicionar event listeners para os botões
  document.getElementById('btnVoltarValidacao').addEventListener('click', window.voltarListaValidacao);
  document.getElementById('btnCancelarValidacao').addEventListener('click', window.voltarListaValidacao);
  document.getElementById('btnConfirmarValidacao').addEventListener('click', () => window.confirmarValidacao(imagem));
}

// ---------- CONFIRMAR VALIDAÇÃO (com prevenção de múltiplos cliques) ----------
let validando = false;

window.confirmarValidacao = async function(imagem) {
  if (validando) {
    console.log("⏳ Validação já em curso, clique ignorado");
    return;
  }
  
  const btn = document.getElementById('btnConfirmarValidacao');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  }
  
  validando = true;
  
  try {
    console.log("🔍 A validar:", imagem);
    
    const forms = document.querySelectorAll('.jogo-form');
    const jogosAtualizados = [];
    
    for (const form of forms) {
      const tipo = form.dataset.tipo;
      const hash = form.dataset.hash;
      const ficheiro = form.dataset.ficheiro;
      
      // Recolher campos comuns
      const jogo = {
        tipo: tipo,
        hash_imagem: hash,
        tipo_ficheiro: ficheiro,
        referencia_unica: form.querySelector('.campo-ref')?.value,
        data_sorteio: form.querySelector('.campo-data-sorteio')?.value,
        concurso: form.querySelector('.campo-concurso')?.value,
        // Manter data_aposta e valor_total originais se existirem, ou definir como vazio
        data_aposta: form.querySelector('.campo-data-aposta')?.value || '',
        valor_total: parseFloat(form.querySelector('.campo-valor')?.value) || 0,
        imagem_origem: imagem,
        apostas: []
      };
      
      // Recolher apostas
      const aposta = {};
      
      if (tipo === 'M1lhão') {
        aposta.codigo = form.querySelector('.campo-codigo')?.value;
      } else {
        // Números
        const numeros = [];
        form.querySelectorAll('.campo-numero').forEach(input => {
          if (input.value) numeros.push(input.value.padStart(2, '0'));
        });
        if (numeros.length > 0) aposta.numeros = numeros;
        
        // Estrelas
        const estrelas = [];
        form.querySelectorAll('.campo-estrela').forEach(input => {
          if (input.value) estrelas.push(input.value.padStart(2, '0'));
        });
        if (estrelas.length > 0) aposta.estrelas = estrelas;
        
        // Nº Sorte
        const sorte = form.querySelector('.campo-sorte')?.value;
        if (sorte) aposta.numero_da_sorte = sorte.padStart(2, '0');
      }
      
      jogo.apostas.push(aposta);
      jogosAtualizados.push(jogo);
    }
    
    // Guardar no GitHub
    const sucesso = await guardarValidacao(imagem, jogosAtualizados);
    
    if (sucesso) {
      alert('✅ Boletim validado com sucesso!');
      window.voltarListaValidacao();
    } else {
      alert('❌ Erro ao guardar validação. Tenta novamente.');
    }
  } catch (err) {
    console.error('Erro na validação:', err);
    alert('❌ Erro inesperado. Tenta novamente.');
  } finally {
    validando = false;
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
};

// ---------- VOLTAR À LISTA ----------
window.voltarListaValidacao = function() {
  console.log("⬅️ A voltar da validação para a lista");
  
  // Usar ViewManager se disponível
  if (window.ViewManager) {
    window.ViewManager.goTo('notificacoesView');
  } else {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById('notificacoesView').classList.add('active');
  }
  
  // Renderizar notificações
  if (typeof window.renderizarNotificacoes === 'function') {
    window.renderizarNotificacoes();
  }
  
  if (typeof window.atualizarBadge === 'function') {
    window.atualizarBadge();
  }
};

// ---------- INICIALIZAR ----------
document.addEventListener('DOMContentLoaded', () => {
  // Se estiver na view de validação, renderizar lista
  if (document.getElementById('validacaoView').classList.contains('active')) {
    renderizarListaValidacao();
  }
});

// Expor funções
window.renderizarListaValidacao = renderizarListaValidacao;
