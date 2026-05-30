import json
import os
import re
import datetime
import requests
from bs4 import BeautifulSoup

# ===== CONFIGURAÇÃO =====
JOGO = "totoloto"
URL_SANTACASA = "https://www.jogossantacasa.pt/web/SCCartazResult/totolotoNew"

def escrever_log(mensagem, origem):
    pasta_repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pasta_logs = os.path.join(pasta_repo, "logs")
    os.makedirs(pasta_logs, exist_ok=True)
    log_path = os.path.join(pasta_logs, f"{JOGO}_sc_log.txt")
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

# ===== MÉTODO 1: REQUESTS + BEAUTIFULSOUP =====
def extrair_totoloto_http():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    response = requests.get(URL_SANTACASA, headers=headers, timeout=15)
    response.encoding = 'utf-8'

    if response.status_code != 200:
        raise Exception(f"HTTP {response.status_code}")

    soup = BeautifulSoup(response.text, 'html.parser')

    # 1. Concurso e data
    span_data = soup.find('span', class_='dataInfo')
    if not span_data:
        raise Exception("Elemento 'span.dataInfo' não encontrado")
    texto = span_data.get_text(strip=True)

    concurso_match = re.search(r'(\d{3}/\d{4})', texto)
    data_match = re.search(r'(\d{2}/\d{2}/\d{4})', texto)
    if not concurso_match or not data_match:
        raise Exception("Concurso ou data não encontrados")

    concurso = concurso_match.group(1)
    data_sorteio = data_match.group(1)

    # 2. Chave
    chave_li = soup.select_one('div.betMiddle.twocol.regPad ul.colums li')
    if not chave_li:
        raise Exception("Chave não encontrada")
    chave_texto = chave_li.get_text(strip=True)
    partes = chave_texto.split('+')
    numeros = [int(n) for n in partes[0].strip().split()]
    especial = int(partes[1].strip())

    # 3. Prémios – seletor mais genérico para evitar falhas
    premios = []
    for ul in soup.select('div.stripped.betMiddle ul.colums'):
        itens = ul.find_all('li')
        if len(itens) >= 4:
            premios.append({
                "premio": itens[0].get_text(strip=True),
                "descricao": itens[1].get_text(strip=True),
                "vencedores": itens[2].get_text(strip=True),
                "valor": itens[3].get_text(strip=True)
            })

    if not premios:
        raise Exception("Prémios não encontrados")

    return {
        "concurso": concurso,
        "data": data_sorteio,
        "numeros": numeros,
        "especial": especial,
        "premios": premios
    }

# ===== MÉTODO 2: SELENIUM (FALLBACK) =====
def extrair_totoloto_selenium():
    import chromedriver_autoinstaller
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    chromedriver_autoinstaller.install()
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
    options.add_argument("--disable-blink-features=AutomationControlled")
    driver = webdriver.Chrome(options=options)

    try:
        driver.get(URL_SANTACASA)
        wait = WebDriverWait(driver, 20)

        span_data_info = wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "span.dataInfo"))
        )
        texto_sorteio = span_data_info.text.strip()
        linhas = texto_sorteio.split("\n")

        concurso = re.search(r"\d{3}/\d{4}", linhas[0]).group(0)
        data_sorteio = re.search(r"\d{2}/\d{2}/\d{4}", linhas[1]).group(0)

        chave_li = driver.find_element(By.CSS_SELECTOR, "div.betMiddle.twocol.regPad ul.colums li")
        chave_texto = chave_li.text.strip()
        partes = chave_texto.split("+")
        numeros = list(map(int, partes[0].strip().split()))
        especial = int(partes[1].strip())

        premios = []
        listas = driver.find_elements(
            By.CSS_SELECTOR,
            "div.stripped.betMiddle ul.colums"
        )
        for ul in listas:
            itens = ul.find_elements(By.TAG_NAME, "li")
            if len(itens) >= 4:
                premios.append({
                    "premio": itens[0].text.strip(),
                    "descricao": itens[1].text.strip(),
                    "vencedores": itens[2].text.strip(),
                    "valor": itens[3].text.strip()
                })

        return {
            "concurso": concurso,
            "data": data_sorteio,
            "numeros": numeros,
            "especial": especial,
            "premios": premios
        }
    finally:
        driver.quit()

# ===== LÓGICA PRINCIPAL =====
def extrair_totoloto_sc():
    try:
        print("🔍 A tentar scraping via HTTP...")
        resultado = extrair_totoloto_http()
        print("✅ Scraping via HTTP bem-sucedido")
        escrever_log("Scraping via HTTP bem-sucedido", JOGO)
        return resultado
    except Exception as e:
        print(f"⚠️ HTTP falhou ({e}). A tentar Selenium...")
        escrever_log(f"HTTP falhou: {e}. A tentar Selenium.", JOGO)
        try:
            resultado = extrair_totoloto_selenium()
            print("✅ Scraping via Selenium bem-sucedido")
            escrever_log("Scraping via Selenium bem-sucedido", JOGO)
            return resultado
        except Exception as e2:
            print(f"❌ Ambos os métodos falharam: {e2}")
            escrever_log(f"Falha total: {e2}", JOGO)
            return None

def atualizar_resultados():
    resultado = extrair_totoloto_sc()
    if resultado is None:
        return

    ano = resultado["concurso"].split("/")[1]

    pasta_repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pasta_dados = os.path.join(pasta_repo, "dados")
    os.makedirs(pasta_dados, exist_ok=True)

    json_path = os.path.join(pasta_dados, f"totoloto_sc_{ano}.json")
    txt_path = os.path.join(pasta_dados, f"totoloto_sc_{ano}.txt")

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(f"Concurso: {resultado['concurso']}\n")
        f.write(f"Data: {resultado['data']}\n")
        f.write(f"Números: {' '.join(map(str, resultado['numeros']))}\n")
        f.write(f"Especial: {resultado['especial']}\n")
        f.write("-" * 40 + "\n")
        f.write("Prémios:\n")
        for p in resultado["premios"]:
            f.write(f"{p['premio']} - {p['descricao']} | Vencedores: {p['vencedores']} | Valor: {p['valor']}\n")
        f.write("-" * 40 + "\n")

    dados = ler_json(json_path, ano)
    lista = dados[str(ano)]

    existe = any(r["concurso"] == resultado["concurso"] for r in lista)
    if existe:
        for i, r in enumerate(lista):
            if r["concurso"] == resultado["concurso"]:
                if not r["premios"] or (resultado["premios"] and r["premios"] != resultado["premios"]):
                    lista[i] = resultado
                    lista.sort(key=lambda r: r["concurso"])
                    dados[str(ano)] = lista
                    gravar_json(json_path, dados)
                    msg = f"Concurso {resultado['concurso']} atualizado com novos dados!"
                    print(msg)
                    escrever_log(msg, "santacasa")
                else:
                    msg = f"Concurso {resultado['concurso']} já está completo."
                    print(msg)
                    escrever_log(msg, "santacasa")
                break
    else:
        lista.append(resultado)
        lista.sort(key=lambda r: r["concurso"])
        dados[str(ano)] = lista
        gravar_json(json_path, dados)
        msg = f"Resultado do concurso {resultado['concurso']} adicionado ao JSON totoloto_sc_{ano}."
        print(msg)
        escrever_log(msg, "santacasa")

if __name__ == "__main__":
    atualizar_resultados()

    # Atualizar ficheiro do sorteio mais recente
    pasta_repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pasta_dados = os.path.join(pasta_repo, "dados")
    ano = datetime.datetime.now().year
    json_path = os.path.join(pasta_dados, f"totoloto_sc_{ano}.json")

    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            dados = json.load(f)
        lista = dados.get(str(ano), [])
        if lista:
            mais_recente = lista[-1]
            with open(os.path.join(pasta_dados, "totoloto_sc_atual.json"), "w", encoding="utf-8") as f_out:
                json.dump(mais_recente, f_out, indent=2, ensure_ascii=False)
