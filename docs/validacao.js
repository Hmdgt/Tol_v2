// ===============================
// 🔧 VALIDAÇÃO DE BOLETINS (OCR -> HUMANO)
// ===============================

const REPO = "Hmdgt/Tol_v2";
const PASTA_APOSTAS = "apostas/";
const PASTA_UPLOADS = "uploads/";
const PASTA_PREPROCESSADAS = "preprocessadas/";

// ---------- FUNÇÃO AUXILIAR: string para base64 (SUPORTA UTF-8) ----------
function stringToBase64(str) {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

// ---------- FUNÇÃO AUXILIAR: base64 para string (SUPORTA UTF-8) ----------
function base64ToString(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// ---------- CARREGAR FICHEIRO DO GITHUB ----------
async function carregarFicheiroGitHub(caminho) {
  const token = localStorage.getItem("github_token");
  if (!token) return { content: null, sha: null };
  
  const url = `https://api.github.com/repos/${REPO}/contents/${caminho}`;
  
  try {
    const res = await fetch(url + `?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.status === 404) return { content: null, sha: null };
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    
    const data = await res.json();
    const jsonText = base64ToString(data.content);
    
    return {
      content: JSON.parse(jsonText),
      sha: data.sha
    };
  } catch (err) {
    console.error(`Erro ao carregar ${caminho}:`, err);
    return { content: null, sha: null };
  }
}

// ---------- GUARDAR FICHEIRO NO GITHUB ----------
async function guardarFicheiroGitHub(caminho, conteudo, sha, mensagem) {
  const token = localStorage.getItem("github_token");
  if (!token) return false;
  
  const url = `https://api.github.com/repos/${REPO}/contents/${caminho}`;
  
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
  const tipos = ['euromilhoes', 'totoloto', 'eurodreams', 'milhao'];
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
  const url = `https://api.github.com/repos/${REPO}/contents/${caminho}`;
  
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
  
  container.innerHTML = '<div class="loading">A carregar boletins...</div>';
  
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
    
    html += `
      <div class="validacao-card" onclick="window.abrirValidacao('${imagem}')">
        <div class="validacao-card-header">
          <ion-icon name="document-text-outline"></ion-icon>
          <span class="validacao-imagem">${imagem}</span>
          <span class="validacao-badge">${totalJogos}</span>
        </div>
        <div class="validacao-tipos">${tipos}</div>
        <div class="validacao-preview">📸 Clique para validar</div>
      </div>
    `;
  }
  
  html += '</div>';
  container.innerHTML = html;
};

// ---------- ABRIR VALIDAÇÃO DE UM BOLETIM ----------
window.abrirValidacao = async function(imagem) {
  console.log("📸 A abrir validação:", imagem);
  
  const boletins = await window.listarBoletinsPorValidar();
  const jogos = boletins[imagem];
  
  if (!jogos) return;
  
  // Mudar para view de validação
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById('validacaoView').classList.add('active');
  
  // Renderizar formulário de validação
  await renderizarFormValidacao(imagem, jogos);
};

// ---------- RENDERIZAR FORMULÁRIO DE VALIDAÇÃO ----------
async function renderizarFormValidacao(imagem, jogos) {
  const container = document.getElementById('validacaoContainer');
  if (!container) return;
  
  let html = `
    <div class="validacao-header">
      <button class="btn-voltar" onclick="window.voltarListaValidacao()">
        <ion-icon name="arrow-back-outline"></ion-icon> Voltar
      </button>
      <h3>Validar Boletim</h3>
      <span class="imagem-nome">${imagem}</span>
    </div>
    
    <div class="validacao-grid">
      <!-- Coluna da Imagem -->
      <div class="imagem-coluna">
        <div class="imagem-container">
          <img id="imagemOriginal" src="" alt="Original" class="imagem-validacao">
        </div>
        <div class="imagens-preprocessadas">
          <h4>Versões Processadas</h4>
          <div class="preprocessadas-grid">
            <img id="imagemBinary" src="" alt="Binarizada" class="preprocessada-img">
            <img id="imagemEnhanced" src="" alt="Realçada" class="preprocessada-img">
          </div>
        </div>
      </div>
      
      <!-- Coluna dos Formulários -->
      <div class="formularios-coluna">
  `;
  
  // Carregar imagens
  const imgOriginal = await carregarImagemGitHub(`${PASTA_UPLOADS}${imagem}`);
  const nomeBase = imagem.replace(/\.[^/.]+$/, "");
  const imgBinary = await carregarImagemGitHub(`${PASTA_PREPROCESSADAS}${nomeBase}_binary.png`);
  const imgEnhanced = await carregarImagemGitHub(`${PASTA_PREPROCESSADAS}${nomeBase}_enhanced.png`);
  
  // Formulários para cada jogo
  jogos.forEach((jogo, index) => {
    html += `
      <div class="jogo-form" data-tipo="${jogo.tipo}" data-hash="${jogo.hash_imagem}" data-ficheiro="${jogo.tipo_ficheiro}">
        <h3>${jogo.tipo} #${index + 1}</h3>
        
        <div class="form-campos">
          <div class="campo">
            <label>Referência Única:</label>
            <input type="text" class="campo-ref" value="${jogo.referencia_unica || ''}" placeholder="Referência">
          </div>
          
          <div class="campo-duplo">
            <div class="campo">
              <label>Data Sorteio:</label>
              <input type="date" class="campo-data-sorteio" value="${jogo.data_sorteio || ''}">
            </div>
            <div class="campo">
              <label>Data Aposta:</label>
              <input type="date" class="campo-data-aposta" value="${jogo.data_aposta || ''}">
            </div>
          </div>
          
          <div class="campo-duplo">
            <div class="campo">
              <label>Concurso:</label>
              <input type="text" class="campo-concurso" value="${jogo.concurso || ''}" placeholder="Ex: 016/2026">
            </div>
            <div class="campo">
              <label>Valor (€):</label>
              <input type="number" step="0.01" class="campo-valor" value="${jogo.valor_total || ''}">
            </div>
          </div>
    `;
    
    // Campos específicos por tipo
    if (jogo.apostas && jogo.apostas.length > 0) {
      jogo.apostas.forEach((aposta, idxAposta) => {
        html += `<h4>Aposta ${idxAposta + 1}</h4>`;
        
        if (jogo.tipo === 'M1lhão') {
          html += `
            <div class="campo">
              <label>Código:</label>
              <input type="text" class="campo-codigo" value="${aposta.codigo || ''}" placeholder="Ex: GTP11668">
            </div>
          `;
        } else {
          if (aposta.numeros) {
            html += `
              <div class="campo-numeros">
                <label>Números (5):</label>
                <div class="numeros-grid">
                  ${aposta.numeros.map((num, i) => `
                    <input type="text" class="campo-numero" data-index="${i}" value="${num}" maxlength="2" placeholder="${i+1}">
                  `).join('')}
                </div>
              </div>
            `;
          }
          
          if (aposta.estrelas) {
            html += `
              <div class="campo-estrelas">
                <label>Estrelas (2):</label>
                <div class="estrelas-grid">
                  ${aposta.estrelas.map((est, i) => `
                    <input type="text" class="campo-estrela" data-index="${i}" value="${est}" maxlength="2" placeholder="★${i+1}">
                  `).join('')}
                </div>
              </div>
            `;
          }
          
          if (aposta.numero_da_sorte) {
            html += `
              <div class="campo">
                <label>Nº da Sorte:</label>
                <input type="text" class="campo-sorte" value="${aposta.numero_da_sorte}" maxlength="2">
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
          <button class="btn-cancelar" onclick="window.voltarListaValidacao()">Cancelar</button>
          <button class="btn-validar" onclick="window.confirmarValidacao('${imagem}')">
            <ion-icon name="checkmark-circle-outline"></ion-icon> Confirmar Validação
          </button>
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Atualizar imagens
  document.getElementById('imagemOriginal').src = imgOriginal;
  if (imgBinary) document.getElementById('imagemBinary').src = imgBinary;
  if (imgEnhanced) document.getElementById('imagemEnhanced').src = imgEnhanced;
}

// ---------- CONFIRMAR VALIDAÇÃO ----------
window.confirmarValidacao = async function(imagem) {
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
      data_aposta: form.querySelector('.campo-data-aposta')?.value,
      concurso: form.querySelector('.campo-concurso')?.value,
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
};

// ---------- VOLTAR À LISTA ----------
window.voltarListaValidacao = function() {
  console.log("⬅️ A voltar da validação para a lista");
  
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById('notificacoesView').classList.add('active');
  renderizarNotificacoes();
  
  // Atualizar badge
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
