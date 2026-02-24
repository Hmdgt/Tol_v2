import requests
from bs4 import BeautifulSoup
import re
import os
import json
import datetime

def escrever_log(mensagem, origem):
    pasta_repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Grave em logs/ ou na raiz
    pasta_logs = os.path.join(pasta_repo, "logs")
    os.makedirs(pasta_logs, exist_ok=True)
    log_path = os.path.join(pasta_logs, "totoloto_log.txt")
    agora = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{agora}] [{origem}] {mensagem}\n")

def ler_json(json_path, ano):
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            dados = json.load(f)
        if str(ano) not in dados or not isinstance(dados[str(ano)], list):
            dados[str(ano)] = []
        return dados
    else:
        return {str(ano): []}

def gravar_json(json_path, dados):
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=2, ensure_ascii=False)

def extrair_totoloto_vercapas():
    url = "https://www.vercapas.com/jogos-santa-casa/numeros-chave-totoloto-resultados-premios/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    container = soup.select_one("div.card-body")
    if not container:
        raise ValueError("Não foi possível encontrar o container com os dados do Totoloto.")

    # Concurso
    concurso_div = container.find(string=re.compile("Sorteio"))
    if concurso_div:
        m = re.search(r"Sorteio[:\s]*([\d/]+)", concurso_div)
        concurso = m.group(1) if m else None
    else:
        raise ValueError("Não foi possível encontrar o texto do sorteio.")

    # Data
    data_div = container.find(string=re.compile("Data do Sorteio"))
    if data_div:
        m = re.search(r"Data do Sorteio[:\s]*(\d{4}-\d{2}-\d{2})", data_div)
        data = m.group(1) if m else None
    else:
        raise ValueError("Não foi possível encontrar o texto da data.")

    if not concurso or not data:
        raise ValueError("Não foi possível extrair concurso ou data.")

    ano, mes, dia = data.split("-")
    data_formatada = f"{dia}/{mes}/{ano}"

    # Números + especial
    numeros_p = container.select_one("p.card-text")
    if not numeros_p:
        raise ValueError("Não foi possível encontrar os números sorteados.")

    numeros_texto = numeros_p.text.strip()
    partes = numeros_texto.split("+")
    numeros = list(map(int, partes[0].strip().split()))
    especial = int(partes[1].strip())

    return {
        "concurso": concurso,
        "data": data_formatada,
        "numeros": numeros,
        "especial": especial
    }

def atualizar_resultados():
    resultado = extrair_totoloto_vercapas()
    ano = resultado["data"].split("/")[-1]
    pasta_repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pasta_dados = os.path.join(pasta_repo, "dados")
    os.makedirs(pasta_dados, exist_ok=True)
    json_path = os.path.join(pasta_dados, f"{ano}.json")

    dados = ler_json(json_path, ano)
    lista = dados[str(ano)]

    existe = any(r["concurso"] == resultado["concurso"] for r in lista)
    if existe:
        msg = f"Resultado do concurso {resultado['concurso']} já existe. Nada a fazer."
        print(msg)
        escrever_log(msg, "vercapas")
    else:
        lista.append(resultado)
        lista.sort(key=lambda r: r["concurso"])
        dados[str(ano)] = lista
        gravar_json(json_path, dados)
        msg = f"Resultado do concurso {resultado['concurso']} adicionado ao JSON {ano}."
        print(msg)
        escrever_log(msg, "vercapas")

if __name__ == "__main__":
    atualizar_resultados()
