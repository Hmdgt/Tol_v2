markdown
# 🎰 Sistema de Apostas Santa Casa

Sistema pessoal para gestão, verificação e notificação de apostas dos jogos Santa Casa (Totoloto, Euromilhões, EuroDreams e M1lhão).

---

## 🎯 Como funciona

1. **📸 Upload** — Tiras foto ao boletim com o telemóvel.
2. **🤖 OCR com IA** — A imagem é processada automaticamente (Google Gemini) e os dados são extraídos (números, datas, concurso).
3. **✅ Validação humana** — Revês e corriges os dados extraídos antes da verificação.
4. **🔍 Verificação automática** — Scripts Python comparam as tuas apostas com os sorteios oficiais e calculam os acertos.
5. **🔔 Notificações** — Recebes notificações push e e-mail com os resultados e prémios.
6. **📊 Estatísticas** — Acompanhas gastos, ganhos e desempenho por jogo e por mês.

Tudo funciona offline e está sincronizado via **GitHub** — o repositório serve como base de dados e o **GitHub Actions** automatiza scraping, verificação, notificações e estatísticas.

---

## 🎮 Jogos Suportados

- **Totoloto** — 5 números (1-49) + 1 Nº da Sorte (1-13)
- **Euromilhões** — 5 números (1-50) + 2 estrelas (1-12)
- **EuroDreams** — 6 números (1-40) + 1 Dream Number (1-5)
- **M1lhão** — 1 código alfanumérico

---

## 🛠️ Tecnologias

- **Frontend**: PWA (HTML/CSS/JS vanilla) — instalável no telemóvel, funciona offline, temas dark/light.
- **Backend**: Python (scripts executados via GitHub Actions).
- **OCR**: Google Gemini (modelos de visão).
- **Scraping**: Selenium (dados oficiais da Santa Casa).
- **Notificações**: Web Push API + Email (SMTP).
- **Armazenamento**: GitHub (ficheiros JSON).

---

## 🚀 Uso

```bash
# Scraping dos sorteios oficiais
python scripts/atualizar_euromilhoes_sc.py
python scripts/atualizar_totoloto_sc.py
python scripts/atualizar_eurodreams_sc.py
python scripts/atualizar_milhao_sc.py

# O sistema faz tudo automaticamente via GitHub Actions.
⚙️ Estrutura simplificada
docs/ — Frontend PWA

scripts/ — Backend Python (scraping, verificação, OCR, notificações, estatísticas)

apostas/ — Apostas registadas (JSON)

dados/ — Sorteios oficiais (JSON)

resultados/ — Histórico de verificações, notificações e estatísticas

🤝 Contribuição
Este é um projeto pessoal, mas sugestões e melhorias são bem-vindas.
Abre uma issue ou envia um pull request se quiseres contribuir.

📄 Licença
Este projeto está sob a licença MIT.

🧬 **Créditos**  
Projeto criado e mantido por **Pirika** — parte do laboratório experimental [PEXP](https://pexp-dev.github.io/).


