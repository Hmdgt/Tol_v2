import os
import smtplib
import json
from email.message import EmailMessage
from email.utils import make_msgid
from datetime import datetime
from typing import List, Dict

# ===== CONFIGURAÇÃO =====
FICHEIRO_HISTORICO = "resultados/notificacoes_historico.json"

def carregar_historico() -> List[Dict]:
    """Carrega o histórico de notificações do ficheiro JSON."""
    if not os.path.exists(FICHEIRO_HISTORICO):
        print("❌ Ficheiro de histórico não encontrado.")
        return []
    with open(FICHEIRO_HISTORICO, "r", encoding="utf-8") as f:
        return json.load(f)

def formatar_data(data_str: str) -> str:
    """Formata data ISO para DD/MM/YYYY."""
    try:
        dt = datetime.fromisoformat(data_str.replace('Z', '+00:00'))
        return dt.strftime("%d/%m/%Y")
    except:
        return data_str

def extrair_valor(premio: dict) -> float:
    """Extrai valor numérico de um prémio (trata 'Reembolso' como 1.0)."""
    valor_str = premio.get('valor', '0').replace('€', '').replace(' ', '').replace(',', '.')
    if 'Reembolso' in valor_str:
        return 1.0
    try:
        return float(valor_str)
    except:
        return 0.0

def gerar_html_premiados(premiados: List[Dict]) -> str:
    """Gera o corpo HTML do email com a lista de prémios ativos."""
    if not premiados:
        return "<p>Nenhum prémio ativo no momento.</p>"

    linhas = []
    for p in premiados:
        jogo = p.get('jogo', p.get('_jogo', 'desconhecido')).upper()
        data = formatar_data(p.get('data', ''))
        concurso = p.get('detalhes', {}).get('sorteio', {}).get('concurso') or p.get('detalhes', {}).get('boletim', {}).get('concurso_sorteio') or '-'
        referencia = p.get('detalhes', {}).get('boletim', {}).get('referencia', '-')
        
        # Processar prémios
        premios_info = []
        valor_total = 0.0
        detalhes = p.get('detalhes', {})
        if 'premios' in detalhes and isinstance(detalhes['premios'], list):
            for pr in detalhes['premios']:
                nome = pr.get('premio', 'Prémio')
                valor = extrair_valor(pr)
                valor_total += valor
                premios_info.append(f"{nome}: € {valor:.2f}".replace('.', ','))
        elif 'premio' in detalhes:
            pr = detalhes['premio']
            nome = pr.get('categoria', pr.get('premio', 'Prémio'))
            valor = extrair_valor(pr)
            valor_total += valor
            premios_info.append(f"{nome}: € {valor:.2f}".replace('.', ','))

        premios_str = '<br>'.join(premios_info) if premios_info else 'Prémio não detalhado'
        valor_total_str = f"€ {valor_total:.2f}".replace('.', ',')

        # Construir descrição da aposta
        aposta = detalhes.get('aposta', {})
        if jogo == 'MILHAO':
            desc_aposta = f"Código: {aposta.get('codigo', '-')}"
        else:
            numeros = aposta.get('numeros', [])
            if numeros:
                desc = ' '.join(numeros)
                if aposta.get('estrelas'):
                    desc += f" + {' '.join(aposta['estrelas'])}"
                if aposta.get('dream_number'):
                    desc += f" Dream: {aposta['dream_number']}"
                if aposta.get('numero_da_sorte'):
                    desc += f" Nº Sorte: {aposta['numero_da_sorte']}"
                desc_aposta = desc
            else:
                desc_aposta = '-'

        linhas.append(f"""
        <tr>
            <td style="border:1px solid #333; padding:8px; text-align:center;">{jogo}</td>
            <td style="border:1px solid #333; padding:8px;">{data}</td>
            <td style="border:1px solid #333; padding:8px;">{concurso}</td>
            <td style="border:1px solid #333; padding:8px;">{referencia}</td>
            <td style="border:1px solid #333; padding:8px;">{desc_aposta}</td>
            <td style="border:1px solid #333; padding:8px;">{premios_str}</td>
            <td style="border:1px solid #333; padding:8px; font-weight:bold; color:#ffd700;">{valor_total_str}</td>
        </tr>
        """)

    tabela = f"""
    <table style="border-collapse:collapse; width:100%; font-family:sans-serif; font-size:14px;">
        <thead>
            <tr style="background:#2a5a2a; color:white;">
                <th style="border:1px solid #333; padding:8px;">Jogo</th>
                <th style="border:1px solid #333; padding:8px;">Data</th>
                <th style="border:1px solid #333; padding:8px;">Concurso</th>
                <th style="border:1px solid #333; padding:8px;">Referência</th>
                <th style="border:1px solid #333; padding:8px;">Aposta</th>
                <th style="border:1px solid #333; padding:8px;">Prémio(s)</th>
                <th style="border:1px solid #333; padding:8px;">Total</th>
            </tr>
        </thead>
        <tbody>
            {''.join(linhas)}
        </tbody>
    </table>
    """

    html = f"""
    <html>
    <head>
        <meta charset="UTF-8">
    </head>
    <body style="background:#111; color:#eee; padding:20px;">
        <h2 style="color:#ffd700; text-align:center;">🏆 Prémios Ativos 🏆</h2>
        <p style="text-align:center;">Lista de boletins premiados ainda não arquivados.</p>
        {tabela}
        <p style="margin-top:20px; font-size:12px; color:#888;">Enviado automaticamente pelo sistema.</p>
    </body>
    </html>
    """
    return html

def enviar_email(remetente: str, senha_app: str, destinatario: str, assunto: str, corpo_html: str):
    """Envia o email com o conteúdo HTML."""
    msg = EmailMessage()
    msg["From"] = remetente
    msg["To"] = destinatario
    msg["Subject"] = assunto
    msg["Content-Language"] = "pt-PT"
    msg.set_content("Prémios ativos – consulte o HTML.")
    msg.add_alternative(corpo_html, subtype='html')

    smtp_server = "smtp.gmail.com"
    smtp_port = 587

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(remetente, senha_app)
            server.send_message(msg)
        print("✅ Email enviado com sucesso.")
    except Exception as e:
        print("❌ Erro ao enviar email:", e)

def main():
    remetente = os.getenv("EMAIL_REMETENTE")
    senha_app = os.getenv("SENHA_APP")
    destinatario = os.getenv("EMAIL_DESTINO")

    if not remetente or not senha_app or not destinatario:
        print("❌ Variáveis de ambiente não configuradas.")
        return

    historico = carregar_historico()
    if not historico:
        print("❌ Histórico vazio ou não carregado.")
        return

    # Filtrar prémios ativos: ganhou === true e !arquivado
    ativos = [item for item in historico if item.get('detalhes', {}).get('ganhou') and not item.get('arquivado')]

    if not ativos:
        print("📭 Nenhum prémio ativo encontrado.")
        corpo_html = "<p>Nenhum prémio ativo no momento.</p>"
    else:
        print(f"📊 Encontrados {len(ativos)} prémios ativos.")
        corpo_html = gerar_html_premiados(ativos)

    assunto = f"🏆 Prémios Ativos - {datetime.now().strftime('%d/%m/%Y')}"
    enviar_email(remetente, senha_app, destinatario, assunto, corpo_html)

if __name__ == "__main__":
    main()
