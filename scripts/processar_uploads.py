import os
import json
import hashlib
import cv2
import numpy as np
import time
from PIL import Image, ImageEnhance, ImageOps
from datetime import datetime
from google import genai
from collections import deque
import threading

# ===== CONFIGURAÇÃO DE MODELOS E CHAVES =====
MODELOS_FALLBACK = [
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]

GEMINI_KEYS = [
    os.getenv("GEMINI_API_KEY"),
    os.getenv("GEMINI_API_KEY_2"),
    os.getenv("GEMINI_API_KEY_3"),
]
GEMINI_KEYS = [key for key in GEMINI_KEYS if key]

if not GEMINI_KEYS:
    raise ValueError("❌ Nenhuma chave Gemini encontrada!")

# ===== FICHEIROS E PASTAS =====
FICHEIRO_COTA_CHAVES = "apostas/cota_por_chave.json"
FICHEIRO_REGISTO = "apostas/registo_processamento.json"
PASTA_UPLOADS = "uploads/"
PASTA_DADOS = "apostas/"
PASTA_PREPROCESSADAS = "preprocessadas/"
PASTA_THUMBNAILS = "thumbnails/"

# ===== CONTROLO DE TAXA =====
REQUISICOES_POR_MINUTO = 5
SEGUNDOS_ENTRE_REQUISICOES = 60 / REQUISICOES_POR_MINUTO
timestamps = deque(maxlen=REQUISICOES_POR_MINUTO)
lock = threading.Lock()
ultima_chave_idx = -1

# ===== FUNÇÕES DE CONTROLO DE CHAVES =====
def carregar_cota_chaves():
    if os.path.exists(FICHEIRO_COTA_CHAVES):
        with open(FICHEIRO_COTA_CHAVES, "r") as f:
            return json.load(f)
    return {}

def guardar_cota_chaves(cota):
    os.makedirs(os.path.dirname(FICHEIRO_COTA_CHAVES), exist_ok=True)
    with open(FICHEIRO_COTA_CHAVES, "w") as f:
        json.dump(cota, f, indent=2)

def obter_cliente_disponivel():
    global ultima_chave_idx
    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    num_keys = len(GEMINI_KEYS)

    for i in range(num_keys):
        idx = (ultima_chave_idx + 1 + i) % num_keys
        key_id = f"key_{idx+1}"
        registo = cota_chaves.get(key_id, {"data": "", "usadas": 0})

        if registo.get("data") != hoje:
            registo = {"data": hoje, "usadas": 0}

        if registo["usadas"] < 20:
            ultima_chave_idx = idx
            print(f"   🔑 Usando {key_id} ({registo['usadas'] + 1}/20 hoje)")
            return genai.Client(api_key=GEMINI_KEYS[idx]), key_id, registo["usadas"] + 1
    return None, None, None

def registar_uso_chave(key_id, usadas_atualizadas):
    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    cota_chaves[key_id] = {"data": hoje, "usadas": usadas_atualizadas}
    guardar_cota_chaves(cota_chaves)

def marcar_chave_esgotada(key_id):
    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    cota_chaves[key_id] = {"data": hoje, "usadas": 20}
    guardar_cota_chaves(cota_chaves)
    print(f"   ⚠️ {key_id} marcada como esgotada (20/20)")

# ===== FUNÇÕES DE SUPORTE E IMAGEM =====
def esperar_rate_limit():
    with lock:
        agora = time.time()
        while timestamps and timestamps[0] < agora - 60:
            timestamps.popleft()
        if len(timestamps) >= REQUISICOES_POR_MINUTO:
            tempo_espera = 60 - (agora - timestamps[0])
            if tempo_espera > 0:
                print(f"   ⏳ Rate limit: a aguardar {tempo_espera:.1f}s...")
                time.sleep(tempo_espera)
        timestamps.append(time.time())

def gerar_hash(caminho):
    h = hashlib.md5()
    with open(caminho, "rb") as f:
        h.update(f.read())
    return h.hexdigest()

def gerar_thumbnail(caminho_original, nome_arquivo):
    os.makedirs(PASTA_THUMBNAILS, exist_ok=True)
    try:
        img = Image.open(caminho_original)
        img = ImageOps.exif_transpose(img)
        img.thumbnail((800, 800))
        img.save(os.path.join(PASTA_THUMBNAILS, nome_arquivo), optimize=True, quality=85)
        print(f"   🖼️ Thumbnail gerada: {nome_arquivo}")
    except Exception as e:
        print(f"   ⚠️ Erro thumbnail: {e}")

def preprocessar_imagem(caminho, img_nome):
    os.makedirs(PASTA_PREPROCESSADAS, exist_ok=True)
    img = cv2.imread(caminho)
    if img is None:
        raise ValueError(f"Imagem não pode ser lida: {caminho}")

    nome_base = os.path.splitext(img_nome)[0]

    # 1. Original
    img_original = ImageOps.exif_transpose(Image.open(caminho))

    # 2. Binarização adaptativa
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11, 2
    )
    img_binary = Image.fromarray(binary)
    img_binary.save(os.path.join(PASTA_PREPROCESSADAS, f"{nome_base}_binary.png"))

    # 3. Alto contraste + nitidez
    enhancer = ImageEnhance.Contrast(img_original)
    img_contrast = enhancer.enhance(3.0)
    enhancer = ImageEnhance.Sharpness(img_contrast)
    img_sharp = enhancer.enhance(2.0)
    img_sharp.save(os.path.join(PASTA_PREPROCESSADAS, f"{nome_base}_enhanced.png"))

    print(f"   📸 Geradas 3 versões")
    return [img_original, img_binary, img_sharp]

# ===== GESTÃO DE DADOS JOGOS =====
def carregar_registo():
    if os.path.exists(FICHEIRO_REGISTO):
        with open(FICHEIRO_REGISTO, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def guardar_registo(reg):
    with open(FICHEIRO_REGISTO, "w", encoding="utf-8") as f:
        json.dump(reg, f, indent=4, ensure_ascii=False)

def limpar_nome_jogo(nome):
    mapping = {
        "Euromilhões": "euromilhoes",
        "Eurodreams": "eurodreams",
        "Totoloto": "totoloto",
        "M1lhão": "milhao",
    }
    return mapping.get(nome, nome.lower().strip().replace(" ", "_"))

def guardar_jogo(jogo, img_nome, img_hash):
    if not jogo.get("tipo"):
        return False

    nome_ficheiro = f"{limpar_nome_jogo(jogo['tipo'])}.json"
    caminho = os.path.join(PASTA_DADOS, nome_ficheiro)

    if os.path.exists(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            historico = json.load(f)
    else:
        historico = []

    ref = jogo.get("referencia_unica")
    if ref and any(item.get("referencia_unica") == ref for item in historico):
        print(f"   ⚠️ Referência {ref} já registada")
        return False

    jogo["imagem_origem"] = img_nome
    jogo["hash_imagem"] = img_hash
    jogo["data_processamento"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    historico.append(jogo)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(historico, f, indent=4, ensure_ascii=False)
    return True

# ===== PROMPT COMPLETO =====
PROMPT_FINAL = """
Tu és um especialista em extração de boletins da Santa Casa da Misericórdia de Lisboa.

Vais analizar fotografias de boletins, de EUROMILHÕES, EURODREAMS, TOTOLOTO e M1LHÃO, e vai retirar informação de cada um dos boletins.

Estás a ver 3 versões da MESMA imagem(boletim). Compara-as e extrai a informação MAIS PRECISA.

IMPORTANTE: A precisão dos dígitos é CRÍTICA. Antes de classificar o tipo de jogo, analise cuidadosamente cada dígito usando as regras abaixo.

REGRAS ABSOLUTAS:
- Números têm SEMPRE 2 dígitos: "01", "07", "12" (nunca "1", "7", "12")
- Se não tens 100% certeza, usa o valor que aparece em MÚLTIPLAS versões
- NUNCA inventes números ou estrelas
- DIFERENCIAÇÃO CRÍTICA: Analisa a curvatura dos dígitos para evitar trocas comuns:
  * [6 vs 8]: O '6' é aberto no topo; o '8' é fechado em dois círculos.
  * [0 vs 8]: O '0' é um oval vazio; o '8' tem um cruzamento central.
  * [1 vs 7]: O '1' é uma barra vertical simples; o '7' tem uma barra horizontal clara no topo.
  * [5 vs 6]: O '5' tem topo reto; o '6' é curvo.
- CONTEXTO NUMÉRICO:
  * Se o número extraído for > 50 (exceto no Totoloto que vai até 49 e EuroDreams até 40), REVERIFICA a imagem. 
  * Se leres "08", confirma se não é um "06" ou "09" devido à inclinação da foto.
- COMPARAÇÃO MULTI-CAMADA: Se 3 versões da MESMA imagem tiverem iluminações diferentes, prioriza a zona onde o contraste entre o papel e a tinta preta é mais nítido.

REGRAS DE NEGÓCIO:
- A imagem contém um ÚNICO boletim, que pode ter várias apostas, mas todas do MESMO tipo de jogo.
- Deves devolver EXATAMENTE UM objeto na lista "jogos", correspondente ao jogo presente.
- Se houver ambiguidade, dá prioridade ao jogo que aparecer mais claramente.
- Identifica os blocos de apostas (1., 2., etc.).

PADRÕES EXATOS POR JOGO:

EUROMILHÕES (Regras de Ouro):
- Linha "N": extrai 5 números.
- Linha "E": extrai 2 ESTRELAS
- Se encontrares 7 números no total para a mesma aposta, os 2 últimos são SEMPRE as estrelas.

EURODREAMS:
- Linha "N": extrai 6 números.
- Linha "S": extrai 1 número (Dream Number).
- Se leres 7 números no total, o último é o Dream Number.

TOTOLOTO:
- Linha 1: "1. 35 37 40 44 46" → 5 números
- Linha 2: "NUMERO DA SORTE 04" → número da sorte

M1LHÃO:
- Código: "GTP 11668" → "GTP11668"

CAMPOS COMUNS (TODOS os jogos):
- "data_sorteio": YYYY-MM-DD (do topo)
- "data_aposta": YYYY-MM-DD (do rodapé)
- "data_emissao": YYYY-MM-DD HH:MM:SS (rodapé)
- "referencia_unica": código do rodapé
- "concurso": número do concurso/sorteio (ex: "015/2026") - extrair do topo do boletim
- "valor_total": decimal (ex: 2.20)
- "valido": true

ESTRUTURA JSON OBRIGATÓRIA POR TIPO DE JOGO:
{
  "jogos": [
    {
      "tipo": "M1lhão",
      "data_sorteio": "2026-02-27",
      "data_aposta": "2026-02-24",
      "data_emissao": "2026-02-24 08:57:56",
      "referencia_unica": "555-02820325-EUR",
      "concurso": "008/2026",
      "valor_total": 0.30,
      "valido": true,
      "apostas": [
        {
          "indice": 1,
          "codigo": "GTP11668"
        }
      ]
    },
    {
      "tipo": "Euromilhões",
      "data_sorteio": "2026-02-24",
      "data_aposta": "2026-02-24",
      "data_emissao": "2026-02-24 08:57:56",
      "referencia_unica": "555-03672294-M1L",
      "concurso": "016/2026",
      "valor_total": 2.20,
      "valido": true,
      "apostas": [
        {
          "indice": 1,
          "numeros": ["04", "05", "32", "33", "48"],
          "estrelas": ["01", "04"]
        }
      ]
    },
    {
      "tipo": "Eurodreams",
      "data_sorteio": "2026-02-24",
      "data_aposta": "2026-02-24",
      "data_emissao": "2026-02-24 08:57:56",
      "referencia_unica": "555-03672294-M1L",
      "concurso": "016/2026",
      "valor_total": 2.50,
      "valido": true,
      "apostas": [
        {
          "indice": 1,
          "numeros": ["02", "06", "32", "33", "34", "35"],
          "dream": ["03"]
        }
      ]
    },
    {
      "tipo": "Totoloto",
      "data_sorteio": "2026-02-07",
      "data_aposta": "2026-02-06",
      "data_emissao": "2026-02-06 18:13:51",
      "referencia_unica": "037-03194624-022",
      "concurso": "011/2026",
      "valor_total": 1.00,
      "valido": true,
      "apostas": [
        {
          "indice": 1,
          "numeros": ["18", "20", "29", "39", "47"],
          "numero_da_sorte": "05"
        }
      ]
    }
  ]
}
Retorna APENAS JSON válido, sem texto adicional.
"""

# ===== PROCESSAMENTO PRINCIPAL =====
def processar_com_multiplas_chaves():
    for p in [PASTA_DADOS, PASTA_UPLOADS, PASTA_PREPROCESSADAS, PASTA_THUMBNAILS]:
        os.makedirs(p, exist_ok=True)

    registo = carregar_registo()
    imagens = [
        f for f in os.listdir(PASTA_UPLOADS)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]

    if not imagens:
        print("📭 Nenhuma imagem encontrada na pasta uploads/")
        return

    imagens_para_processar = []
    for f in imagens:
        caminho = os.path.join(PASTA_UPLOADS, f)
        img_hash = gerar_hash(caminho)
        if img_hash not in registo:
            imagens_para_processar.append((f, caminho, img_hash))

    if not imagens_para_processar:
        print("📭 Nenhuma imagem nova para processar.")
        return

    print(f"\n📊 Encontradas {len(imagens_para_processar)} imagens para processar")
    print(f"🔑 {len(GEMINI_KEYS)} chaves disponíveis (limite total: {len(GEMINI_KEYS) * 20}/dia)")
    print(f"⏱️  Rate limit minuto: {REQUISICOES_POR_MINUTO} req/min\n")

    processadas_com_sucesso = 0
    idx = 0

    while idx < len(imagens_para_processar):
        img_nome, caminho, img_hash = imagens_para_processar[idx]
        print(f"\n🚀 [{idx+1}/{len(imagens_para_processar)}] {img_nome}")

        gerar_thumbnail(caminho, img_nome)
        versoes = preprocessar_imagem(caminho, img_nome)

        sucesso_imagem = False
        erro_irrecuperavel = False

        for modelo_nome in MODELOS_FALLBACK:
            if sucesso_imagem or erro_irrecuperavel:
                break

            tentativas_key = 0
            while tentativas_key < len(GEMINI_KEYS):
                cliente, key_id, usadas_atual = obter_cliente_disponivel()
                if not cliente:
                    print("🚫 Todas as chaves esgotadas para hoje.")
                    print(f"   Processadas hoje: {processadas_com_sucesso}")
                    print(f"   Restantes: {len(imagens_para_processar) - idx} imagens")
                    return

                try:
                    esperar_rate_limit()
                    print(f"   🤖 Tentando {modelo_nome} | {key_id}")

                    resposta = cliente.models.generate_content(
                        model=modelo_nome,
                        contents=[PROMPT_FINAL] + versoes,
                        config={
                            "temperature": 0,
                            "response_mime_type": "application/json",
                        },
                    )

                    registar_uso_chave(key_id, usadas_atual)
                    dados = json.loads(resposta.text)

                    jogos_nesta_imagem = 0
                    for jogo in dados.get("jogos", []):
                        # validação extra por tipo
                        if jogo.get("tipo") == "M1lhão":
                            if not any(aposta.get("codigo") for aposta in jogo.get("apostas", [])):
                                print(f"   ⚠️ Ignorado M1lhão sem código na imagem {img_nome}")
                                continue

                        jogo["confirmado"] = False
                        if guardar_jogo(jogo, img_nome, img_hash):
                            jogos_nesta_imagem += 1

                    if jogos_nesta_imagem > 0:
                        print(f"   ✅ {jogos_nesta_imagem} jogo(s) processado(s)")
                        registo[img_hash] = {
                            "arquivo": img_nome,
                            "data": datetime.now().isoformat(),
                            "jogos": jogos_nesta_imagem,
                        }
                        guardar_registo(registo)
                        processadas_com_sucesso += 1
                        sucesso_imagem = True
                    else:
                        print("   ⚠️ Nenhum jogo válido encontrado")

                    break  # sai do loop de chaves para este modelo

                except Exception as e:
                    msg = str(e).upper()
                    print(f"   ❌ Erro: {e}")

                    if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                        marcar_chave_esgotada(key_id)
                        print(f"   🔄 Chave {key_id} esgotada. Tentando próxima chave...")
                        tentativas_key += 1
                        continue
                    elif "503" in msg or "UNAVAILABLE" in msg:
                        print(f"   ⚠️ {modelo_nome} instável (503). A tentar próximo modelo...")
                        break
                    else:
                        print("   ⚠️ Erro não recuperável para esta imagem. A avançar.")
                        erro_irrecuperavel = True
                        break

        idx += 1

    print(f"\n{'='*50}")
    print("🏁 PROCESSAMENTO CONCLUÍDO")
    print(f"{'='*50}")
    print(f"✅ Processadas hoje: {processadas_com_sucesso}")
    print(f"📊 Total na pasta: {len(imagens)} imagens")
    print(f"📅 Restantes: {len(imagens_para_processar) - processadas_com_sucesso} imagens")

    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    print(f"\n🔑 Estado das chaves hoje ({hoje}):")
    for i in range(len(GEMINI_KEYS)):
        key_id = f"key_{i+1}"
        registo_chave = cota_chaves.get(key_id, {"usadas": 0, "data": ""})
        usadas = registo_chave["usadas"] if registo_chave.get("data") == hoje else 0
        print(f"   {key_id}: {usadas}/20")

if __name__ == "__main__":
    processar_com_multiplas_chaves()
