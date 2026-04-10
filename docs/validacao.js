// ===============================
// 🔧 VALIDAÇÃO DE BOLETINS (OCR -> HUMANO)
// ===============================

// Usar configuração global (do config.js)
const PASTA_APOSTAS = CONFIG.PASTAS.APOSTAS;
const PASTA_UPLOADS = CONFIG.PASTAS.UPLOADS;
const PASTA_PREPROCESSADAS = CONFIG.PASTAS.PREPROCESSADAS;

// ---------- FUNÇÕES AUXILIARES ----------
function normalizarJogo(jogo) {
    if (!jogo) return 'desconhecido';
    let normalizado = String(jogo).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/m1lhão|m1lhao/gi, 'milhao')
        .trim();
    if (normalizado.includes('eurodream')) return 'eurodreams';
    if (normalizado.includes('euromilho')) return 'euromilhoes';
    if (normalizado.includes('totoloto')) return 'totoloto';
    if (normalizado.includes('milhao')) return 'milhao';
    return normalizado;
}

function formatarData(dataStr) {
    if (!dataStr) return '-';
    if (dataStr.includes('-')) {
        const [ano, mes, dia] = dataStr.split(' ')[0].split('-');
        return `${dia}/${mes}/${ano}`;
    }
    if (dataStr.includes('/')) return dataStr;
    return dataStr;
}

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

// ---------- GUARDAR VALIDAÇÃO ----------
async function guardarValidacao(imagem, jogosAtualizados) {
  console.log("A guardar validação para:", imagem);

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
      `Validação humana: ${imagem}`
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
        <div class="validacao-preview">Clique para validar</div>
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

// ---------- ABRIR VALIDAÇÃO ----------
window.abrirValidacao = async function(imagem) {
  console.log("A abrir validação:", imagem);
  
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

// ---------- RENDERIZAR FORMULÁRIO (ESTILO CARD, SEM DUPLICAÇÃO) ----------
async function renderizarFormValidacao(imagem, jogos) {
  const container = document.getElementById('validacaoContainer');
  if (!container) return;
  
  const thumbnailUrl = await carregarImagemGitHub(`thumbnails/${imagem}`);
  const imagemUrl = thumbnailUrl || await carregarImagemGitHub(`uploads/${imagem}`);
  
  let html = `
    <div class="validacao-header" style="justify-content: center;">
      <h2>Validar Boletim</h2>
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
    
    const jogoNormalizado = normalizarJogo(jogo.tipo);
    let logoClass = '';
    if (jogoNormalizado === 'euromilhoes') logoClass = 'logo-euromilhoes';
    else if (jogoNormalizado === 'totoloto') logoClass = 'logo-totoloto';
    else if (jogoNormalizado === 'eurodreams') logoClass = 'logo-eurodreams';
    else if (jogoNormalizado === 'milhao') logoClass = 'logo-milhao';
    
    const originalEncoded = encodeURIComponent(JSON.stringify(jogo));
    
    html += `
      <div class="jogo-form notification-card" 
           data-tipo="${tipoEscaped}" 
           data-hash="${hashEscaped}" 
           data-ficheiro="${ficheiroEscaped}"
           data-original="${originalEncoded}">
        
        <!-- Logo do jogo -->
        <div class="logo-sprite ${logoClass}">${tipoEscaped}</div>
        
        <!-- Campos de edição compactos -->
        <div class="form-campos-edicao">
          <div class="campo-duplo">
            <div class="campo">
              <label>Data Sorteio</label>
              <input type="date" class="campo-data-sorteio" value="${dataSorteioEscaped}">
            </div>
            <div class="campo">
              <label>Concurso</label>
              <input type="text" class="campo-concurso" value="${concursoEscaped}" placeholder="000/2026">
            </div>
          </div>
          
          <div class="campo">
            <label>Referência Única</label>
            <input type="text" class="campo-ref" value="${refEscaped}" placeholder="Referência">
          </div>
    `;
    
    // Apostas
    if (jogo.apostas && jogo.apostas.length > 0) {
      jogo.apostas.forEach((aposta, idxAposta) => {
        if (jogo.tipo === 'M1lhão') {
          html += `
            <div class="campo">
              <label>Código</label>
              <input type="text" class="campo-codigo" value="${escapeHTML(aposta.codigo || '')}" placeholder="Ex: GTP11668">
            </div>
          `;
        } else {
          // Números
          if (aposta.numeros) {
            const gridClass = (jogoNormalizado === 'eurodreams') ? 'numeros-grid-6' : 'numeros-grid';
            html += `<div class="campo"><label>Números</label><div class="${gridClass}">`;
            aposta.numeros.forEach((num, i) => {
              html += `<input type="text" class="campo-numero" data-aposta="${idxAposta}" data-index="${i}" value="${escapeHTML(num)}" maxlength="2" placeholder="${i+1}">`;
            });
            html += `</div></div>`;
          }
          
          // Estrelas
          if (aposta.estrelas) {
            html += `<div class="campo"><label>Estrelas</label><div class="estrelas-grid">`;
            aposta.estrelas.forEach((est, i) => {
              html += `<input type="text" class="campo-estrela" data-aposta="${idxAposta}" data-index="${i}" value="${escapeHTML(est)}" maxlength="2" placeholder="★${i+1}">`;
            });
            html += `</div></div>`;
          }
          
          // Nº da Sorte
          if (aposta.numero_da_sorte !== undefined) {
            html += `
              <div class="campo">
                <label>Nº da Sorte</label>
                <input type="text" class="campo-sorte" data-aposta="${idxAposta}" value="${escapeHTML(aposta.numero_da_sorte)}" maxlength="2">
              </div>
            `;
          }
          
          // Dream Number
          let dreamValue = '';
          if (aposta.dream && Array.isArray(aposta.dream) && aposta.dream.length > 0) {
            dreamValue = aposta.dream[0];
          } else if (aposta.dream_number !== undefined) {
            dreamValue = aposta.dream_number;
          }
          if (dreamValue) {
            html += `
              <div class="campo">
                <label>Dream Number</label>
                <input type="text" class="campo-dream" data-aposta="${idxAposta}" value="${escapeHTML(dreamValue)}" maxlength="2" placeholder="00">
              </div>
            `;
          }
        }
      });
    }
    
    html += `</div>`; // fecha form-campos-edicao
    html += `</div>`; // fecha notification-card
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

  // ========== ZOOM/PAN (inalterado) ==========
  // ... (código do zoom/pan mantido exatamente como estava)
  // (não vou repetir aqui para poupar espaço, mas mantém o teu código atual)

  const zoomContainer = document.getElementById('zoomContainer');
  const zoomImg = zoomContainer.querySelector('img');

  let scale = 1.5;
  let translateX = 0;
  let translateY = 0;
  let isDragging = false;
  let startDrag = { x: 0, y: 0 };
  let startTranslate = { x: 0, y: 0 };
  let initialPinchDistance = 0;
  let initialPinchScale = 1;
  let pinchMidpoint = { x: 0, y: 0 };
  let pinchStartTranslate = { x: 0, y: 0 };

  const MIN_SCALE = 1;
  const MAX_SCALE = 5;

  let containerWidth = 0;
  let containerHeight = 0;
  let imgWidth = 0;
  let imgHeight = 0;

  function updateTransform() {
    zoomImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }

  function clampScale() {
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  function constrainPan() {
    if (imgWidth === 0 || containerWidth === 0) return;
    
    const scaledImgWidth = imgWidth * scale;
    const scaledImgHeight = imgHeight * scale;
    
    const minX = Math.min(0, containerWidth - scaledImgWidth);
    const maxX = Math.max(0, containerWidth - scaledImgWidth);
    const minY = Math.min(0, containerHeight - scaledImgHeight);
    const maxY = Math.max(0, containerHeight - scaledImgHeight);
    
    translateX = Math.min(maxX, Math.max(minX, translateX));
    translateY = Math.min(maxY, Math.max(minY, translateY));
  }

  zoomContainer.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && e.isPrimary === false) return;
    
    isDragging = true;
    startDrag.x = e.clientX;
    startDrag.y = e.clientY;
    startTranslate.x = translateX;
    startTranslate.y = translateY;
    zoomContainer.setPointerCapture(e.pointerId);
    zoomContainer.classList.add('dragging');
  });

  zoomContainer.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    
    const dx = e.clientX - startDrag.x;
    const dy = e.clientY - startDrag.y;
    
    translateX = startTranslate.x + dx;
    translateY = startTranslate.y + dy;
    
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

  zoomContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance = Math.hypot(dx, dy);
      initialPinchScale = scale;
      
      pinchMidpoint.x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchMidpoint.y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      pinchStartTranslate.x = translateX;
      pinchStartTranslate.y = translateY;
    }
  });

  zoomContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.hypot(dx, dy);
      
      if (initialPinchDistance === 0) return;
      
      let newScale = initialPinchScale * (currentDistance / initialPinchDistance);
      newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
      
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      
      const pX = (pinchMidpoint.x - pinchStartTranslate.x) / initialPinchScale;
      const pY = (pinchMidpoint.y - pinchStartTranslate.y) / initialPinchScale;
      
      translateX = midX - pX * newScale;
      translateY = midY - pY * newScale;
      scale = newScale;
      
      constrainPan();
      updateTransform();
    }
  }, { passive: false });

  zoomContainer.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      initialPinchDistance = 0;
    }
  });

  zoomContainer.addEventListener('touchcancel', () => {
    initialPinchDistance = 0;
  });

  zoomContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const rect = zoomContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const imgX = (mouseX - translateX) / scale;
    const imgY = (mouseY - translateY) / scale;
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    let newScale = scale * delta;
    newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    
    translateX = mouseX - imgX * newScale;
    translateY = mouseY - imgY * newScale;
    scale = newScale;
    
    constrainPan();
    updateTransform();
  }, { passive: false });

  zoomImg.onload = () => {
    containerWidth = zoomContainer.clientWidth;
    containerHeight = zoomContainer.clientHeight;
    imgWidth = zoomImg.naturalWidth;
    imgHeight = zoomImg.naturalHeight;
    
    scale = 1.5;
    translateX = 0;
    translateY = 0;
    
    constrainPan();
    updateTransform();
  };

  if (zoomImg.complete) {
    zoomImg.onload();
  }

  let lastTap = 0;
  zoomContainer.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (e.touches.length === 0 && now - lastTap < 300) {
      scale = scale === 1.5 ? 1 : 1.5;
      constrainPan();
      updateTransform();
    }
    lastTap = now;
  });
  
  document.getElementById('btnCancelarValidacao').addEventListener('click', window.voltarListaValidacao);
  document.getElementById('btnConfirmarValidacao').addEventListener('click', () => window.confirmarValidacao(imagem));
}

// ---------- CONFIRMAR VALIDAÇÃO (com campo ref) ----------
let validando = false;

window.confirmarValidacao = async function(imagem) {
  if (validando) {
    console.log("Validação já em curso, clique ignorado");
    return;
  }
  
  const btn = document.getElementById('btnConfirmarValidacao');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  }
  
  validando = true;
  
  try {
    console.log("A validar:", imagem);
    
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
        for (let idxAposta = 0; idxAposta < original.apostas.length; idxAposta++) {
          const apostaOriginal = original.apostas[idxAposta];
          const novaAposta = { ...apostaOriginal };
          
          const inputsNumero = form.querySelectorAll(`.campo-numero[data-aposta="${idxAposta}"]`);
          if (inputsNumero.length > 0) {
            const numeros = [];
            inputsNumero.forEach(input => {
              if (input.value) numeros.push(input.value.padStart(2, '0'));
            });
            if (numeros.length) novaAposta.numeros = numeros;
          }
          
          const inputsEstrela = form.querySelectorAll(`.campo-estrela[data-aposta="${idxAposta}"]`);
          if (inputsEstrela.length > 0) {
            const estrelas = [];
            inputsEstrela.forEach(input => {
              if (input.value) estrelas.push(input.value.padStart(2, '0'));
            });
            if (estrelas.length) novaAposta.estrelas = estrelas;
          }
          
          const inputSorte = form.querySelector(`.campo-sorte[data-aposta="${idxAposta}"]`);
          if (inputSorte && inputSorte.value) {
            novaAposta.numero_da_sorte = inputSorte.value.padStart(2, '0');
          }
          
          const inputDream = form.querySelector(`.campo-dream[data-aposta="${idxAposta}"]`);
          if (inputDream && inputDream.value) {
            const dreamVal = inputDream.value.padStart(2, '0');
            if (apostaOriginal.dream && Array.isArray(apostaOriginal.dream)) {
              novaAposta.dream = [dreamVal];
            } else {
              novaAposta.dream_number = dreamVal;
            }
          }
          
          apostasEditadas.push(novaAposta);
        }
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
  console.log("A voltar da validação para a lista");
  
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

window.renderizarListaValidacao = renderizarListaValidacao;
