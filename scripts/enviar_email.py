import os
import smtplib
from email.message import EmailMessage
from email.utils import make_msgid
from email.mime.image import MIMEImage
from datetime import datetime

def enviar_email_html(txt_path, remetente, senha_app, destinatario, assunto="Resultado Totoloto"):
    # Lê o conteúdo do txt, que tem o concurso, data, números etc
    with open(txt_path, "r", encoding="utf-8") as f:
        corpo_txt = f.read()

    # EXEMPLO: extrair info do txt (ideal extrair com regex no teu txt real)
    # Aqui vamos supor que txt tem linhas tipo:
    # Concurso: 058/2025
    # Data: 19/07/2025
    # Números: 15 23 29 34 36
    # Especial: 8
    concurso = None
    data = None
    numeros = None
    especial = None
    for line in corpo_txt.splitlines():
        if line.lower().startswith("concurso:"):
            concurso = line.split(":",1)[1].strip()
        elif line.lower().startswith("data:"):
            data = line.split(":",1)[1].strip()
        elif line.lower().startswith("números:") or line.lower().startswith("numeros:"):
            numeros = line.split(":",1)[1].strip()
        elif line.lower().startswith("especial:"):
            especial = line.split(":",1)[1].strip()

    # Definir estilos que queres ajustar facilmente aqui:
    titulo_style = "font-family: Arial, sans-serif; font-size: 24px; color: #2E86C1; font-weight: bold;"
    info_style = "font-family: Verdana, sans-serif; font-size: 16px; color: #1B2631;"
    numeros_style = "font-family: 'Arial', monospace; font-size: 34px; color: #2E86C1; font-weight: bold;"

    # Gerar um Content-ID para a imagem (para referência no HTML)
    cid = make_msgid(domain="exemplo.com")

    # Criar o corpo HTML do email
    corpo_html = f"""
    <html lang="pt-PT">
      <body>
        <h2 style="{titulo_style}">Último Resultado</h2>

        <table style="border:1px solid #000; border-collapse: collapse; width: 350px;">
          <tr>
            <td style="border:1px solid #000; padding:10px; width:160px; text-align:center;">
              <img src="cid:{cid[1:-1]}" alt="Logo" style="max-width:150px; height:auto;">
            </td>
            <td style="border:1px solid #000; padding:10px; vertical-align: middle; {info_style}">
              <p><strong>Concurso:</strong> {concurso or 'N/A'}</p>
              <p><strong>Data:</strong> {data or 'N/A'}</p>
            </td>
          </tr>
        </table>

        <p style="{numeros_style} margin-top: 18px; letter-spacing: 6px; text-align: center;">
          {numeros or ''} + {especial or ''}
        </p>
      </body>
    </html>
    """

    # Criar mensagem
    msg = EmailMessage()
    msg["From"] = remetente
    msg["To"] = destinatario
    msg["Subject"] = assunto
    msg["Content-Language"] = "pt-PT"
    msg.set_content(corpo_txt)  # Versão texto puro
    msg.add_alternative(corpo_html, subtype='html')

    # Anexar a imagem (ajusta o caminho conforme a tua estrutura)
    caminho_imagem = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../assets/toto.png")
    with open(caminho_imagem, "rb") as img:
        img_data = img.read()
    msg.get_payload()[1].add_related(img_data, maintype='image', subtype='png', cid=cid)

    # Enviar email
    smtp_server = "smtp.gmail.com"
    smtp_port = 587

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(remetente, senha_app)
            server.send_message(msg)
        print("Email enviado com sucesso.")
    except Exception as e:
        print("Erro ao enviar email:", e)


if __name__ == "__main__":
    remetente = os.getenv("EMAIL_REMETENTE")
    senha_app = os.getenv("SENHA_APP")
    destinatario = os.getenv("EMAIL_DESTINO")

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    ano_atual = datetime.now().year

    txt_path = os.path.join(
        BASE_DIR,
        "../dados",
        f"{ano_atual}.txt"
    )

    if not remetente or not senha_app or not destinatario:
        print("Configure as variáveis de ambiente EMAIL_REMETENTE, SENHA_APP e EMAIL_DESTINO.")
    else:
        enviar_email_html(txt_path, remetente, senha_app, destinatario)
