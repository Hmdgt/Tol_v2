// ===============================
// ⚙️ CONFIGURAÇÕES GLOBAIS
// ===============================

const CONFIG = {
  // Repositório GitHub
  REPO: "Hmdgt/Tol_v2",
  
  // Pastas (caminhos relativos)
  PASTAS: {
    APOSTAS: "apostas/",
    UPLOADS: "uploads/",
    PREPROCESSADAS: "preprocessadas/"
  },
  
  // Ficheiros
  FICHEIROS: {
    NOTIFICACOES: "resultados/notificacoes_ativas.json",
    HISTORICO: "resultados/notificacoes_historico.json"
    ESTATISTICAS: "resultados/estatisticas_completas.json"   // <-- adiciona esta linha
  },
  
  // Tipos de jogos
  TIPOS_JOGO: ['euromilhoes', 'totoloto', 'eurodreams', 'milhao'],
  
  // Cache do Service Worker
  CACHE_VERSION: "v2026-03-01"
};

// Para facilitar o acesso (mantém compatibilidade)
const REPO = CONFIG.REPO;
