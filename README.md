# 🎰 Sistema de Verificação de Apostas Santa Casa

Sistema completo para gestão, verificação e notificação de apostas dos jogos Santa Casa (Totoloto, Euromilhões, EuroDreams e M1lhão).

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Funcionalidades](#funcionalidades)
- [Jogos Suportados](#jogos-suportados)
- [Como Funciona](#como-funciona)
- [Configuração](#configuração)
- [Uso](#uso)
- [API de Dados](#api-de-dados)
- [Automatização](#automatização)
- [Tecnologias](#tecnologias)
- [Contribuição](#contribuição)
- [Licença](#licença)

---

## 🎯 Visão Geral

O **Sistema de Verificação de Apostas Santa Casa** é uma solução completa que permite:

- 📸 **Upload** de boletins físicos via fotografia
- 🤖 **OCR automático** para extração de dados
- ✅ **Validação humana** para correção de erros
- 🔍 **Verificação automática** contra sorteios oficiais
- 🔔 **Notificações** de resultados e prémios
- 📊 **Estatísticas** detalhadas por jogo e período

---

## 🏗️ Arquitetura
┌─────────────────────────────────────────────────────────────┐
│ Frontend (PWA) │
│ • Upload de imagens │
│ • Validação manual │
│ • Visualização de notificações │
│ • Estatísticas interativas │
└─────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│ GitHub Repository (Armazenamento) │
│ • Apostas (JSON) │
│ • Sorteios oficiais (JSON) │
│ • Resultados e notificações │
│ • Imagens originais e thumbnails │
└─────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│ Backend (Python Scripts) │
│ • Scraping dos sorteios oficiais │
│ • Verificação automática │
│ • Geração de notificações │
│ • Cálculo de estatísticas │
└─────────────────────────────────────────────────────────────┘

text

---

## 📁 Estrutura do Projeto
Tol_v2-main/
├── 📁 docs/ # Frontend PWA
│ ├── index.html # Página principal
│ ├── app.js # Navegação e gestão de views
│ ├── config.js # Configurações globais
│ ├── upload.js # Upload e OCR
│ ├── validacao.js # Validação humana
│ ├── notificacoes.js # Notificações
│ ├── estatisticas.js # Estatísticas
│ ├── utils.js # Utilitários
│ ├── service-worker.js # PWA offline
│ ├── manifest.json # Manifest PWA
│ └── assets/ # Imagens e sprites
│
├── 📁 scripts/ # Backend Python
│ ├── verificar_totoloto.py # Verificador Totoloto
│ ├── verificar_euromilhoes.py # Verificador Euromilhões
│ ├── verificar_eurodreams.py # Verificador EuroDreams
│ ├── verificar_milhao.py # Verificador M1lhão
│ ├── gerar_notificacoes.py # Gerador de notificações
│ ├── gerar_estatisticas_completas.py
│ ├── atualizar_sc.py # Scraping dos sorteios
│ └── processar_uploads.py # Processamento OCR
│
├── 📁 apostas/ # Apostas registadas
│ ├── totoloto.json
│ ├── euromilhoes.json
│ ├── eurodreams.json
│ └── milhao.json
│
├── 📁 dados/ # Sorteios oficiais
│ ├── totoloto_sc.json
│ ├── euromilhoes_.json
│ ├── eurodreams_.json
│ └── milhao_*.json
│
├── 📁 resultados/ # Resultados e notificações
│ ├── *_verificacoes.json # Histórico completo
│ ├── *_recentes.json # Últimas verificações
│ ├── notificacoes_ativas.json # Notificações não lidas
│ ├── notificacoes_historico.json
│ └── estatisticas_completas.json
│
├── 📁 uploads/ # Imagens originais
├── 📁 thumbnails/ # Miniaturas
└── 📁 logs/ # Logs de processamento

text

---

## ✨ Funcionalidades

### 1. 📸 Upload de Boletins
- Captura de fotografia ou upload de imagem
- Geração automática de referência única
- Extração OCR dos dados da aposta
- Armazenamento no GitHub

### 2. ✅ Validação Humana
- Interface com zoom/pan para verificar a imagem
- Correção manual de números e datas
- Confirmação antes da verificação automática
- Marcação como `confirmado: true`

### 3. 🔍 Verificação Automática
- Comparação com sorteios oficiais
- Cálculo de acertos (números, estrelas, dream numbers)
- Identificação de prémios ganhos
- Atualização de estatísticas

### 4. 🔔 Notificações
- Visualização de resultados
- Detalhes dos prémios ganhos
- Marcação como lidas
- Arquivamento de prémios

### 5. 📊 Estatísticas
- **Resumo**: Tabelas mensais/anuais com gastos, recebimentos e saldo
- **Premiados**: Lista de boletins com prémios (com seleção para arquivar)
- **Pendentes**: Apostas por verificar

---

## 🎮 Jogos Suportados

### Totoloto
- **Aposta**: 5 números (1-49) + 1 Nº Sorte (1-13)
- **Prémios**: 1º ao 5º prémio + Nº da Sorte
- **Ficheiro**: `apostas/totoloto.json`

### Euromilhões
- **Aposta**: 5 números (1-50) + 2 estrelas (1-12)
- **Prémios**: 13 categorias
- **Ficheiro**: `apostas/euromilhoes.json`

### EuroDreams
- **Aposta**: 6 números (1-40) + 1 Dream (1-5)
- **Prémios**: 6 categorias (1º apenas com Dream)
- **Ficheiro**: `apostas/eurodreams.json`

### M1lhão
- **Aposta**: 1 código alfanumérico
- **Prémio**: 1.000.000€ (código exato)
- **Ficheiro**: `apostas/milhao.json`

---

## 🔄 Como Funciona

### Fluxo Completo
📸 UPLOAD
↓
Utilizador tira foto → OCR → apostas/{jogo}.json (confirmado: false)

✅ VALIDAÇÃO
↓
Correção manual → confirmado: true

🔍 VERIFICAÇÃO (Python)
↓
python scripts/verificar_{jogo}.py
↓
resultados/{jogo}_verificacoes.json (histórico)
resultados/{jogo}_recentes.json (última execução)

🔔 NOTIFICAÇÕES (Python)
↓
python scripts/gerar_notificacoes.py
↓
resultados/notificacoes_ativas.json

📊 ESTATÍSTICAS (Python)
↓
python scripts/gerar_estatisticas_completas.py
↓
resultados/estatisticas_completas.json

🎨 VISUALIZAÇÃO (SPA)
↓
Notificações visíveis na interface
Estatísticas atualizadas

text

---

## ⚙️ Configuração

### Pré-requisitos

- Python 3.8+
- Node.js (opcional, para desenvolvimento)
- GitHub token com permissões de escrita

### Variáveis de Ambiente

```bash
# GitHub Configuration
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_REPO=username/repo-name

# Python Dependencies
pip install selenium webdriver-manager pillow pytesseract requests
Configuração no Frontend (docs/config.js)
javascript
const CONFIG = {
    REPO: "username/Tol_v2-main",
    PASTAS: {
        APOSTAS: "apostas/",
        UPLOADS: "uploads/",
        THUMBNAILS: "thumbnails/",
        RESULTADOS: "resultados/",
        DADOS: "dados/"
    },
    TIPOS_JOGO: ["totoloto", "euromilhoes", "eurodreams", "milhao"],
    FICHEIROS: {
        ESTATISTICAS: "resultados/estatisticas_completas.json",
        HISTORICO: "resultados/notificacoes_historico.json"
    }
};
🚀 Uso
Executar Localmente
bash
# 1. Clonar repositório
git clone https://github.com/username/Tol_v2-main.git
cd Tol_v2-main

# 2. Configurar ambiente Python
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou venv\Scripts\activate  # Windows

pip install -r requirements.txt

# 3. Atualizar sorteios
python scripts/atualizar_totoloto_sc.py
python scripts/atualizar_euromilhoes_sc.py
python scripts/atualizar_eurodreams_sc.py
python scripts/atualizar_milhao_sc.py

# 4. Verificar apostas
python scripts/verificar_totoloto.py
python scripts/verificar_euromilhoes.py
python scripts/verificar_eurodreams.py
python scripts/verificar_milhao.py

# 5. Gerar notificações e estatísticas
python scripts/gerar_notificacoes.py
python scripts/gerar_estatisticas_completas.py

# 6. Servir frontend (opcional)
cd docs
python -m http.server 8000
# Aceder em http://localhost:8000
Executar via GitHub Actions (Automático)
O sistema está configurado para executar automaticamente:

A cada 4 horas (via cron)

Quando novas apostas são enviadas (push em apostas/)

Manualmente via workflow_dispatch

📊 API de Dados
Estrutura dos Ficheiros JSON
Aposta (apostas/{jogo}.json)
json
[{
  "referencia_unica": "foto_1743012345678_abc123.png",
  "imagem_origem": "foto_1743012345678_abc123.png",
  "data_sorteio": "2024-01-15",
  "concurso": "016/2026",
  "tipo": "totoloto",
  "confirmado": true,
  "hash_imagem": "abc123...",
  "apostas": [{
    "indice": 1,
    "numeros": ["01", "15", "23", "34", "45"],
    "numero_da_sorte": "07"
  }],
  "data_upload": "2026-03-26T14:30:00Z",
  "data_validacao": "2026-03-26T15:45:00Z",
  "validado_por": "humano"
}]
Sorteio (dados/{jogo}_{ano}.json)
json
{
  "2026": [{
    "concurso": "016/2026",
    "data": "15/01/2026",
    "numeros": [1, 15, 23, 34, 45],
    "especial": 7,
    "premios": [
      {"premio": "1.º Prémio", "valor": "1000000€"},
      {"premio": "2.º Prémio", "valor": "50000€"}
    ]
  }]
}
Resultado (resultados/{jogo}_verificacoes.json)
json
[{
  "data_verificacao": "2026-03-26 14:30:00",
  "boletim": {
    "referencia": "foto_1743012345678_abc123.png",
    "concurso_sorteio": "016/2026",
    "data_sorteio": "2024-01-15"
  },
  "aposta": {
    "indice": 1,
    "numeros": ["01", "15", "23", "34", "45"],
    "numero_da_sorte": "07"
  },
  "acertos": {
    "numeros": 5,
    "numero_da_sorte": true
  },
  "ganhou": true,
  "premio": {"premio": "1.º Prémio", "valor": "1000000€"}
}]
Notificação (resultados/notificacoes_ativas.json)
json
[{
  "id": "totoloto_foto_1743012345678_abc123_1",
  "jogo": "totoloto",
  "data": "2026-03-26T14:30:00",
  "lido": false,
  "titulo": "🎫 Novo resultado TOTOLOTO",
  "subtitulo": "Boletim: foto_1743012345678_abc123.png",
  "resumo": "Ganhou: 5 números + Nº da Sorte – Total: € 1.000.000,00",
  "detalhes": {...}
}]
🤖 Automatização
GitHub Actions Workflow
yaml
name: Verificar Apostas

on:
  push:
    paths: ['apostas/*.json']
  schedule:
    - cron: '0 */4 * * *'
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Verificar Totoloto
        run: python scripts/verificar_totoloto.py
      
      - name: Verificar Euromilhões
        run: python scripts/verificar_euromilhoes.py
      
      - name: Verificar EuroDreams
        run: python scripts/verificar_eurodreams.py
      
      - name: Verificar M1lhão
        run: python scripts/verificar_milhao.py
      
      - name: Gerar Notificações
        run: python scripts/gerar_notificacoes.py
      
      - name: Gerar Estatísticas
        run: python scripts/gerar_estatisticas_completas.py
      
      - name: Commit Resultados
        run: |
          git config user.name "Bot"
          git config user.email "bot@github.com"
          git add resultados/ estatisticas_completas.json
          git commit -m "🤖 Atualizar verificações" || exit 0
          git push
🛠️ Tecnologias
Frontend
HTML5/CSS3 - Estrutura e estilos

JavaScript (ES6+) - Lógica da aplicação

PWA - Service Worker, offline support

GitHub API - Armazenamento e sincronização

Backend
Python 3.8+ - Scripts de processamento

Selenium - Scraping dos sorteios

Pillow - Processamento de imagens

Tesseract OCR - Extração de texto

Infraestrutura
GitHub - Versionamento e CI/CD

GitHub Actions - Automação

JSON - Formato de dados

🤝 Contribuição
Fork o projeto

Crie uma branch (git checkout -b feature/nova-feature)

Commit suas alterações (git commit -m 'Adiciona nova feature')

Push para a branch (git push origin feature/nova-feature)

Abra um Pull Request

Guidelines
Mantenha a estrutura de pastas existente

Atualize a documentação quando necessário

Teste localmente antes de submeter

Siga as convenções de código existentes

📄 Licença
Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

📞 Suporte
Para dúvidas ou sugestões:

Abra uma issue

Envie um email para suporte@exemplo.com

🙏 Agradecimentos
Santa Casa da Misericórdia de Lisboa pelos dados oficiais

Comunidade open-source pelas bibliotecas utilizadas

Desenvolvido com ❤️ para facilitar a gestão de apostas
