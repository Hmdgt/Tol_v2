import os
import smtplib
import json
from email.message import EmailMessage
from datetime import datetime
from typing import List, Dict

# ===== CONFIGURAÇÃO =====
FICHEIRO_PREMIADOS_PENDENTES = "resultados/premiados_pendentes.json"

def carregar_premiados_pendentes() -> List[Dict]:
    """Carrega apenas os prémios pendentes (não arquivados)"""
    if not os.path.exists(FICHEIRO_PREMIADOS_PENDENTES):
        print(f"❌ Ficheiro {FICHEIRO_PREMIADOS_PENDENTES} não encontrado.")
        return []
    
    try:
        with open(FICHEIRO_PREMIADOS_PENDENTES, "r", encoding="utf-8") as f:
            premiados = json.load(f)
    except Exception as e:
        print(f"❌ Erro ao ler {FICHEIRO_PREMIADOS_PENDENTES}: {e}")
        return []
    
    # Filtrar apenas os não arquivados
    pendentes = [p for p in premiados if not p.get('arquivado', False)]
    return pendentes

def formatar_data(data_str: str) -> str:
    try:
        dt = datetime.fromisoformat(data_str.replace('Z', '+00:00'))
        return dt.strftime("%d/%m/%Y")
    except:
        return data_str

def extrair_valor(premio: dict) -> float:
    valor_str = premio.get('valor', '0').replace('€', '').replace(' ', '').replace(',', '.')
    if 'Reembolso' in valor_str:
        return 1.0
    try:
        return float(valor_str)
    except:
        return 0.0

def gerar_html_premiados(premiados: List[Dict]) -> str:
    """Gera HTML com cards semelhantes aos da SPA."""
    if not premiados:
        return "<p style='color: #888; text-align: center;'>Nenhum prémio ativo no momento.</p>"

    cards_html = []
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

        # Descrição da aposta
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

        # Construir card
        card = f"""
        <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 16px; margin-bottom: 16px; font-family: Arial, sans-serif; color: #eee;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="background: #2a5a2a; padding: 6px 14px; border-radius: 20px; font-weight: bold; color: white;">{jogo}</span>
                <span style="color: #ffd700; font-weight: bold;">{premios_info[0].split(':')[0] if premios_info else 'Prémio'}</span>
            </div>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 15px; font-size: 14px;">
                <span style="color: #888;">Data:</span><span>{data}</span>
                <span style="color: #888;">Concurso:</span><span>{concurso}</span>
                <span style="color: #888;">Referência:</span><span>{referencia}</span>
                <span style="color: #888;">Aposta:</span><span>{desc_aposta}</span>
                <span style="color: #888;">Prémio:</span><span style="color: #ffd700;">{premios_str}</span>
                <span style="color: #888;">Total:</span><span style="color: #ffd700; font-weight: bold;">{valor_total_str}</span>
            </div>
        </div>
        """
        cards_html.append(card)

    html = f"""
    <html>
    <head>
        <meta charset="UTF-8">
    </head>
    <body style="background: #111; color: #eee; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #ffd700; text-align: center; margin-bottom: 25px;">🏆 Prémios Pendentes</h2>
        <p style="text-align: center; color: #aaa; margin-bottom: 20px;">Lista de boletins premiados ainda não reclamados.</p>
        <div style="max-width: 600px; margin: 0 auto;">
            {''.join(cards_html)}
        </div>
        <p style="margin-top: 30px; font-size: 12px; color: #888; text-align: center;">Enviado automaticamente pelo sistema.</p>
    </body>
    </html>
    """
    return html

def enviar_email(remetente: str, senha_app: str, destinatario: str, assunto: str, corpo_html: str):
    msg = EmailMessage()
    msg["From"] = remetente
    msg["To"] = destinatario
    msg["Subject"] = assunto
    msg["Content-Language"] = "pt-PT"
    msg.set_content("Prémios pendentes – consulte o HTML.")
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

    # Carregar apenas os prémios pendentes (não arquivados)
    premiados_pendentes = carregar_premiados_pendentes()
    
    if not premiados_pendentes:
        print("📭 Nenhum prémio pendente encontrado.")
        corpo_html = "<p style='color: #888; text-align: center;'>Nenhum prémio pendente no momento.</p>"
    else:
        print(f"🏆 Encontrados {len(premiados_pendentes)} prémio(s) pendente(s).")
        corpo_html = gerar_html_premiados(premiados_pendentes)

    assunto = f"🏆 Prémios Pendentes - {datetime.now().strftime('%d/%m/%Y')}"
    enviar_email(remetente, senha_app, destinatario, assunto, corpo_html)

if __name__ == "__main__":
    main()
