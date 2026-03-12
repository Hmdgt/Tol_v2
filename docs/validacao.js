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
    
    if (res.status === 404) return { content: null, sha: null };
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    
    const data = await res.json();
    const jsonText = base64ToString(data.content);
    
    return {
      content: JSON.parse(jsonText),
      sha: data.sha
    };
  } catch (err) {
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
  const tipos = CONFIG.TIPOS_JOGO;
  const boletinsPorImagem = {};

  for (const tipo of tipos) {
    const caminho = `${PASTA_APOSTAS}${tipo}.json`;
    const { content } = await carregarFicheiroGitHub(caminho);

    if (content && Array.isArray(content)) {
      const naoConfirmados = content.filter(jogo => !jogo.confirmado);

      for (const jogo of naoConfirmados) {
        const img = jogo.imagem_origem;

        if (!boletinsPorImagem[img]) {
          boletinsPorImagem[img] = {
            tipo: jogo.tipo,
            lista: []
          };
        }

        if (boletinsPorImagem[img].tipo !== jogo.tipo) {
          console.warn(`Ignorado jogo de tipo diferente na mesma imagem: ${img}`);
          continue;
        }

        boletinsPorImagem[img].lista.push({
          ...jogo,
          tipo_ficheiro: tipo,
          _indice: content.findIndex(j => j.hash_imagem === jogo.hash_imagem)
        });
      }
    }
  }

  const resultado = {};
  for (const [img, dados] of Object.entries(boletinsPorImagem)) {
    resultado[img] = dados.lista;
  }

  return resultado;
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

  const tipos = new Set(jogosAtualizados.map(j => j.tipo_ficheiro));
  if (tipos.size > 1) {
    console.error("❌ ERRO: mistura de tipos na validação! Operação cancelada.");
    return false;
  }

  const porFicheiro = {};

  for (const jogo of jogosAtualizados) {
    const tipo = jogo.tipo_ficheiro;
    if (!porFicheiro[tipo]) {
      porFicheiro[tipo] = { conteudo: [], sha: null, jogos: [] };
    }
    porFicheiro[tipo].jogos.push(jogo);
  }

  for (const [tipo, data] of Object.entries(porFicheiro)) {
    const caminho = `${PASTA_APOSTAS}${tipo}.json`;

    const { content, sha } = await carregarFicheiroGitHub(caminho);
    if (!content) continue;

    for (const jogoAtualizado of data.jogos) {
      const indice = content.findIndex(j => j.hash_imagem === jogoAtualizado.hash_imagem);
      if (indice !== -1) {
        content[indice] = {
          ...jogoAtualizado,
          confirmado: true,
          data_validacao: new Date().toISOString(),
          validado_por: "humano"
        };
      }
    }

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
    const total = jogos.length;
    const tipo = jogos[0].tipo;

    html += `
      <div class="validacao-card" data-imagem="${escapeHTML(imagem)}">
        <div class="validacao-card-header">
          <ion-icon name="document-text-outline"></ion-icon>
          <span class="validacao-imagem">${escapeHTML(imagem)}</span>
          <span class="validacao-badge">${total}</span>
        </div>
        <div class="validacao-tipos">${escapeHTML(tipo)}</div>
        <div class="validacao-preview">📸 Clique para validar</div>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;

  document.querySelectorAll('.validacao-card').forEach(card => {
    card.addEventListener('click', () => {
      window.abrirValidacao(card.dataset.imagem);
    });
  });
};

// ---------- ABRIR VALIDAÇÃO DE UM BOLETIM ----------
window.abrirValidacao = async function(imagem) {
  console.log("📸 A abrir validação:", imagem);
  
  window.ViewManager.goTo('validacaoView');
  
  const container = document.getElementById('validacaoContainer');
  if (container) {
    container.innerHTML = '<div class="loading"><ion-icon name="sync-outline" class="spin"></ion-icon><p>A carregar boletim...</p></div>';
  }
  
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

// ---------- RENDERIZAR FORMULÁRIO DE VALIDAÇÃO (COM ZOOM/PAN) ----------
async function renderizarFormValidacao(imagem, jogos) {
  const container = document.getElementById('validacaoContainer');
  if (!container) return;
  
  const imagemEscaped = escapeHTML(imagem);
  
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
      <div class="imagem-coluna">
        <div class="zoom-container" id="zoomContainer">
          <img src="${imagemUrl}" alt="Boletim" class="zoom-img"
               onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100%25\' height=\'100%25\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%23333\'/%3E%3Ctext x=\'10\' y=\'55\' fill=\'%23888\' font-size=\'10\'%3EImagem não disponível%3C/text%3E%3C/svg%3E';">
        </div>
      </div>
      
      <div class="formularios-coluna">
  `;
  
  jogos.forEach((jogo, index) => {
    const tipoEscaped = escapeHTML(jogo.tipo);
    const hashEscaped = escapeHTML(jogo.hash_imagem);
    const ficheiroEscaped = escapeHTML(jogo.tipo_ficheiro);
    const refEscaped = escapeHTML(jogo.referencia_unica || '');
    const dataSorteioEscaped = escapeHTML(jogo.data_sorteio || '');
    const concursoEscaped = escapeHTML(jogo.concurso || '');
    
    const originalEncoded = encodeURIComponent(JSON.stringify(jogo));
    
    html += `
      <div class="jogo-form" 
           data-tipo="${tipoEscaped}" 
           data-hash="${hashEscaped}" 
           data-ficheiro="${ficheiroEscaped}"
           data-original="${originalEncoded}">
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

          if (aposta.dream_number !== undefined) {
            let dreamEscaped = escapeHTML(aposta.dream_number);
            if (dreamEscaped.length === 1) dreamEscaped = '0' + dreamEscaped;
            html += `
              <div class="campo">
                <label>Dream Number:</label>
                <input type="text" class="campo-dream" value="${dreamEscaped}" maxlength="2" placeholder="00">
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
  
  // ========== INICIALIZAR ZOOM/PAN ==========
  const zoomContainer = document.getElementById('zoomContainer');
  const zoomImg = zoomContainer.querySelector('img');

  let scale = 1.5;
  let translateX = 0;
  let translateY = 0;
  let startX, startY;
  let isDragging = false;
  let lastDist = 0;
  let pinchScale = 1;

  const MIN_SCALE = 1;
  const MAX_SCALE = 5;

  function updateTransform() {
    zoomImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale * pinchScale})`;
  }

  function clampScale() {
    let total = scale * pinchScale;
    if (total < MIN_SCALE) {
      let factor = MIN_SCALE / total;
      scale *= factor;
      pinchScale *= factor;
    } else if (total > MAX_SCALE) {
      let factor = MAX_SCALE / total;
      scale *= factor;
      pinchScale *= factor;
    }
  }

  function constrainPan() {
    const containerRect = zoomContainer.getBoundingClientRect();
    const imgRect = zoomImg.getBoundingClientRect();
    const maxX = Math.max(0, (imgRect.width - containerRect.width) / 2);
    const minX = -maxX;
    const maxY = Math.max(0, (imgRect.height - containerRect.height) / 2);
    const minY = -maxY;
    translateX = Math.min(maxX, Math.max(minX, translateX));
    translateY = Math.min(maxY, Math.max(minY, translateY));
  }

  zoomContainer.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    zoomContainer.setPointerCapture(e.pointerId);
    zoomContainer.classList.add('dragging');
  });

  zoomContainer.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    constrainPan();
    updateTransform();
  });

  zoomContainer.addEventListener('pointerup', () => {
    isDragging = false;
    zoomContainer.classList.remove('dragging');
  });
  zoomContainer.addEventListener('pointerleave', () => {
    isDragging = false;
    zoomContainer.classList.remove('dragging');
  });

  zoomContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale *= delta;
    clampScale();
    updateTransform();
  }, { passive: false });

  zoomContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist) {
        pinchScale *= dist / lastDist;
        clampScale();
        updateTransform();
      }
      lastDist = dist;
    }
  }, { passive: false });

  zoomContainer.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) lastDist = 0;
  });
  zoomContainer.addEventListener('touchcancel', () => { lastDist = 0; });

  zoomImg.onload = () => {
    scale = 1.5;
    translateX = 0;
    translateY = 0;
    pinchScale = 1;
    updateTransform();
  };
  if (zoomImg.complete) zoomImg.onload();

  document.getElementById('btnVoltarValidacao').addEventListener('click', window.voltarListaValidacao);
  document.getElementById('btnCancelarValidacao').addEventListener('click', window.voltarListaValidacao);
  document.getElementById('btnConfirmarValidacao').addEventListener('click', () => window.confirmarValidacao(imagem));
}

// ---------- CONFIRMAR VALIDAÇÃO ----------
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
      const original = JSON.parse(decodeURIComponent(form.dataset.original));
      
      const referencia_unica = form.querySelector('.campo-ref')?.value;
      const data_sorteio = form.querySelector('.campo-data-sorteio')?.value;
      const concurso = form.querySelector('.campo-concurso')?.value;
      
      const apostasEditadas = [];
      
      if (original.tipo === 'M1lhão') {
        const inputsCodigo = form.querySelectorAll('.campo-codigo');
        original.apostas.forEach((apostaOriginal, idx) => {
          const codigoInput = inputsCodigo[idx];
          if (codigoInput) {
            apostasEditadas.push({
              ...apostaOriginal,
              codigo: codigoInput.value
            });
          } else {
            apostasEditadas.push(apostaOriginal);
          }
        });
      } else {
        const inputsNumero = form.querySelectorAll('.campo-numero');
        const inputsEstrela = form.querySelectorAll('.campo-estrela');
        const inputSorte = form.querySelector('.campo-sorte');
        const inputDream = form.querySelector('.campo-dream');
        
        original.apostas.forEach((apostaOriginal, idx) => {
          const numeros = [];
          const estrelas = [];
          
          const startNum = idx * 5;
          const startEst = idx * 2;
          
          for (let i = 0; i < 5; i++) {
            const input = inputsNumero[startNum + i];
            if (input && input.value) {
              numeros.push(input.value.padStart(2, '0'));
            }
          }
          for (let i = 0; i < 2; i++) {
            const input = inputsEstrela[startEst + i];
            if (input && input.value) {
              estrelas.push(input.value.padStart(2, '0'));
            }
          }
          
          const novaAposta = {
            ...apostaOriginal,
            numeros: numeros.length ? numeros : apostaOriginal.numeros,
            estrelas: estrelas.length ? estrelas : apostaOriginal.estrelas
          };
          
          if (inputSorte) {
            novaAposta.numero_da_sorte = inputSorte.value.padStart(2, '0');
          }
          if (inputDream) {
            novaAposta.dream_number = inputDream.value.padStart(2, '0');
          }
          
          apostasEditadas.push(novaAposta);
        });
      }
      
      const jogoAtualizado = {
        ...original,
        referencia_unica,
        data_sorteio,
        concurso,
        imagem_origem: imagem,
        apostas: apostasEditadas
      };
      
      jogosAtualizados.push(jogoAtualizado);
    }
    
    const sucesso = await guardarValidacao(imagem, jogosAtualizados);
    
    if (sucesso) {
      ToastManager.mostrar("✅ Boletim validado com sucesso!", "sucesso");
      window.voltarListaValidacao();
    } else {
      ToastManager.mostrar("❌ Erro ao guardar validação. Tenta novamente.", "erro");
    }
  } catch (err) {
    console.error('Erro na validação:', err);
    ToastManager.mostrar("❌ Erro inesperado. Tenta novamente.", "erro");
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
  
  window.ViewManager.goTo('notificacoesView');
  
  if (typeof window.renderizarNotificacoes === 'function') {
    window.renderizarNotificacoes();
  }
  
  if (typeof window.atualizarBadge === 'function') {
    window.atualizarBadge();
  }
};

// ---------- INICIALIZAR ----------
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('validacaoView').classList.contains('active')) {
    renderizarListaValidacao();
  }
});

// Expor funções
window.renderizarListaValidacao = renderizarListaValidacao;
