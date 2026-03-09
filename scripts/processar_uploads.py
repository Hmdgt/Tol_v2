import os
import json
import hashlib
import cv2
import numpy as np
import time
from PIL import Image, ImageOps
from datetime import datetime
from google import genai
from collections import deque
import threading

# ===== CONFIGURAÇÃO DAS CHAVES =====
GEMINI_KEYS = [
    os.getenv("GEMINI_API_KEY"),
    os.getenv("GEMINI_API_KEY_2"),
    os.getenv("GEMINI_API_KEY_3")
]

GEMINI_KEYS = [key for key in GEMINI_KEYS if key]

print("🔑 Debug - Chaves encontradas:")
for i, key in enumerate(GEMINI_KEYS):
    print(f"   key_{i+1}: {'✓' if key else '✗'} (primeiros 4 chars: {key[:4] if key else 'none'})")

if not GEMINI_KEYS:
    raise ValueError("❌ Nenhuma chave Gemini encontrada!")

print(f"🔑 Carregadas {len(GEMINI_KEYS)} chaves Gemini")

# ===== FICHEIROS DE CONTROLO =====
FICHEIRO_COTA_CHAVES = "apostas/cota_por_chave.json"
FICHEIRO_REGISTO = "apostas/registo_processamento.json"

# ===== PASTAS =====
PASTA_UPLOADS = "uploads/"
PASTA_DADOS = "apostas/"
PASTA_PREPROCESSADAS = "preprocessadas/"
PASTA_THUMBNAILS = "thumbnails/"

# ===== CONTROLO DE TAXA (5 por minuto) =====
REQUISICOES_POR_MINUTO = 5
SEGUNDOS_ENTRE_REQUISICOES = 60 / REQUISICOES_POR_MINUTO

timestamps = deque(maxlen=REQUISICOES_POR_MINUTO)
lock = threading.Lock()

# ===== CONTROLO DE CHAVES =====
def carregar_cota_chaves():
    if os.path.exists(FICHEIRO_COTA_CHAVES):
        with open(FICHEIRO_COTA_CHAVES, "r") as f:
            return json.load(f)
    return {}

def guardar_cota_chaves(cota):
    with open(FICHEIRO_COTA_CHAVES, "w") as f:
        json.dump(cota, f, indent=2)

def obter_cliente_disponivel():
    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    for idx, key in enumerate(GEMINI_KEYS):
        key_id = f"key_{idx+1}"
        registo = cota_chaves.get(key_id, {"data": "", "usadas": 0})
        if registo["data"] != hoje:
            registo = {"data": hoje, "usadas": 0}
        if registo["usadas"] < 20:
            print(f"   🔑 Usando {key_id} ({registo['usadas'] + 1}/20 hoje)")
            return genai.Client(api_key=key), key_id, registo["usadas"] + 1
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

# ===== RATE LIMIT =====
def esperar_rate_limit():
    with lock:
        agora = time.time()
        while timestamps and timestamps[0] < agora - 60:
            timestamps.popleft()
        if len(timestamps) >= REQUISICOES_POR_MINUTO:
            mais_antigo = timestamps[0]
            tempo_espera = 60 - (agora - mais_antigo)
            if tempo_espera > 0:
                print(f"   ⏳ Rate limit minuto: a aguardar {tempo_espera:.1f}s...")
                time.sleep(tempo_espera)
        timestamps.append(time.time())

# ===== THUMBNAIL =====
def gerar_thumbnail(caminho_original, nome_arquivo):
    os.makedirs(PASTA_THUMBNAILS, exist_ok=True)
    try:
        img = Image.open(caminho_original)
        img = ImageOps.exif_transpose(img)
        img.thumbnail((800, 800))
        caminho_thumb = os.path.join(PASTA_THUMBNAILS, nome_arquivo)
        img.save(caminho_thumb, optimize=True, quality=85)
        print(f"   🖼️ Thumbnail gerada: {nome_arquivo}")
    except Exception as e:
        print(f"   ⚠️ Erro ao gerar thumbnail: {e}")

# ===== PREPROCESSAMENTO (DESKEW + OTSU + UNSHARP) =====
def preprocessar_imagem(caminho, img_nome):
    os.makedirs(PASTA_PREPROCESSADAS, exist_ok=True)

    img = cv2.imread(caminho)
    if img is None:
        raise ValueError(f"Imagem não pode ser lida: {caminho}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Blur leve antes de Otsu para estabilizar
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    coords = np.column_stack(np.where(th == 0))
    angle = cv2.minAreaRect(coords)[-1]

    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    (h, w) = gray.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    # Unsharp mask suave
    blur2 = cv2.GaussianBlur(rotated, (0, 0), 2)
    sharp = cv2.addWeighted(rotated, 1.3, blur2, -0.3, 0)

    caminho_proc = os.path.join(PASTA_PREPROCESSADAS, f"ocr_{img_nome}")
    cv2.imwrite(caminho_proc, sharp)

    img_original = Image.open(caminho)
    img_sharp = Image.fromarray(sharp)

    # Ordem: primeiro a versão mais nítida
    versoes = [img_sharp, img_original]
    print(f"   📸 Geradas {len(versoes)} versões (sharp + original)")
    return versoes

# ===== VALIDAÇÃO DE JOGOS =====
def validar_jogo(jogo):
    try:
        if jogo.get("tipo") == "Euromilhões":
            for ap in jogo.get("apostas", []):
                nums = ap.get("numeros", [])
                est = ap.get("estrelas", [])

                if len(nums) != 5 or len(est) != 2:
                    return False
                if len(set(nums)) != 5 or len(set(est)) != 2:
                    return False

                nums_int = [int(n) for n in nums]
                est_int = [int(e) for e in est]

                if any(n < 1 or n > 50 for n in nums_int):
                    return False
                if any(e < 1 or e > 12 for e in est_int):
                    return False
        # Outros tipos podem ter validações futuras
        return True
    except Exception:
        return False

# ===== PROMPT DO GEMINI (OTIMIZADO) =====
PROMPT_FINAL = """
Tu és um especialista em extração de boletins da Santa Casa da Misericórdia de Lisboa.

Vais receber 2 versões da MESMA imagem:
- Imagem 1: versão pré-processada (mais nítida e alinhada)
- Imagem 2: imagem original

SEGUE ESTES PASSOS, SEM FALHAR:

PASSO 1 — Extrai os números e campos da Imagem 1.
PASSO 2 — Extrai os números e campos da Imagem 2.
PASSO 3 — Compara os resultados da Imagem 1 e Imagem 2.
PASSO 4 — Se forem iguais, usa esse resultado.
PASSO 5 — Se forem diferentes, analisa a forma geométrica dos dígitos:
  - '3' tem aberturas laterais; '8' é fechado em dois círculos.
  - '6' tem o topo aberto; '8' tem dois círculos fechados.
  - '0' é um oval vazio; '8' tem cruzamento interno.
  - '1' é uma barra vertical simples; '7' tem barra horizontal clara no topo.
PASSO 6 — Nunca inventes números que não apareçam em nenhuma das imagens.
PASSO 7 — Se não tiveres 100% certeza, escolhe o valor que aparece de forma mais consistente entre as duas imagens.

REGRAS ABSOLUTAS:
- Números têm SEMPRE 2 dígitos: "01", "07", "12" (nunca "1", "7", "12").
- NUNCA inventes números ou estrelas.
- Se o número extraído for > 50 (exceto no Totoloto que vai até 49 e EuroDreams até 40), REVERIFICA a imagem.
- No Euromilhões, estrelas são SEMPRE de 01 a 12. Se leres "18" numa estrela, é erro de OCR.

REGRAS DE NEGÓCIO:
- A imagem contém um ÚNICO boletim, que pode ter várias apostas, mas todas do MESMO tipo de jogo.
- Deves devolver EXATAMENTE UM objeto na lista "jogos", correspondente ao jogo presente.
- Se houver ambiguidade, dá prioridade ao jogo que aparecer mais claramente.

PADRÕES EXATOS POR JOGO:

EUROMILHÕES:
1. Identifica os blocos de apostas (1., 2., etc.).
2. NÚMEROS (N): 5 números principais na linha do "N".
3. ESTRELAS (E): 2 números na linha imediatamente abaixo do "N", precedidos por "E".
4. Um jogo de Euromilhões NUNCA tem 0 estrelas.

EURODREAMS:
- Linha "N": 6 números.
- Linha "S": 1 número (Dream Number).

TOTOLOTO:
- Linha 1: 5 números.
- Linha 2: "NUMERO DA SORTE": 1 número.

M1LHÃO:
- Código tipo "GTP 11668" → "GTP11668".

CAMPOS COMUNS:
- "data_sorteio": YYYY-MM-DD (topo).
- "data_aposta": YYYY-MM-DD (rodapé).
- "data_emissao": YYYY-MM-DD HH:MM:SS (rodapé).
- "referencia_unica": código do rodapé.
- "concurso": "NNN/AAAA".
- "valor_total": decimal (ex: 2.20).
- "valido": true.

ESTRUTURA JSON OBRIGATÓRIA:
{
  "jogos": [
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
    }
  ]
}
Retorna APENAS JSON válido, sem texto adicional.
"""

# ===== PROCESSAMENTO PRINCIPAL =====
def processar_com_multiplas_chaves():
    os.makedirs(PASTA_DADOS, exist_ok=True)
    os.makedirs(PASTA_UPLOADS, exist_ok=True)
    os.makedirs(PASTA_PREPROCESSADAS, exist_ok=True)
    os.makedirs(PASTA_THUMBNAILS, exist_ok=True)

    registo = carregar_registo()

    imagens = [f for f in os.listdir(PASTA_UPLOADS) if f.lower().endswith((".jpg", ".jpeg", ".png"))]

    if not imagens:
        print("📭 Nenhuma imagem encontrada na pasta uploads/")
        return

    imagens_nao_processadas = []
    for img_nome in imagens:
        caminho = os.path.join(PASTA_UPLOADS, img_nome)
        img_hash = gerar_hash(caminho)
        if img_hash not in registo:
            imagens_nao_processadas.append((img_nome, caminho, img_hash))

    if not imagens_nao_processadas:
        print("📭 Nenhuma imagem nova para processar.")
        return

    print(f"\n📊 Encontradas {len(imagens_nao_processadas)} imagens para processar")
    print(f"🔑 {len(GEMINI_KEYS)} chaves disponíveis (limite total: {len(GEMINI_KEYS) * 20}/dia)")
    print(f"⏱️  Rate limit minuto: {REQUISICOES_POR_MINUTO} req/min\n")

    processadas_com_sucesso = 0
    idx = 0

    while idx < len(imagens_nao_processadas):
        img_nome, caminho, img_hash = imagens_nao_processadas[idx]
        print(f"[{idx+1}/{len(imagens_nao_processadas)}] 🚀 {img_nome}")

        gerar_thumbnail(caminho, img_nome)

        cliente, key_id, usadas_atual = obter_cliente_disponivel()

        if not cliente:
            print(f"\n🚫 TODAS AS CHAVES ESGOTADAS! ({len(GEMINI_KEYS)} * 20 = {len(GEMINI_KEYS)*20} requisições)")
            print(f"   Processadas hoje: {processadas_com_sucesso}")
            print(f"   Restantes: {len(imagens_nao_processadas) - idx} imagens")
            break

        try:
            versoes = preprocessar_imagem(caminho, img_nome)

            esperar_rate_limit()

            prompt = PROMPT_FINAL

            resposta = cliente.models.generate_content(
                model="gemini-2.5-flash",
                contents=[prompt] + versoes,
                config={
                    "temperature": 0,
                    "response_mime_type": "application/json"
                }
            )

            resposta_texto = resposta.text
            print("\n📦 RESPOSTA BRUTA DO GEMINI:")
            print(resposta_texto)
            print("-" * 50)

            registar_uso_chave(key_id, usadas_atual)

            dados = json.loads(resposta_texto)

            for jogo in dados.get("jogos", []):
                jogo["confirmado"] = False

            jogos_processados = 0
            for jogo in dados.get("jogos", []):
                # Hard reject por validação
                if not validar_jogo(jogo):
                    print(f"   ⚠️ Jogo inválido pela validação de regras. Ignorado.")
                    continue

                if jogo["tipo"] == "M1lhão":
                    if not any(aposta.get("codigo") for aposta in jogo.get("apostas", [])):
                        print(f"   ⚠️ Ignorado M1lhão sem código na imagem {img_nome}")
                        continue

                if guardar_jogo(jogo, img_nome, img_hash):
                    jogos_processados += 1

            if jogos_processados > 0:
                print(f"   ✅ {jogos_processados} jogo(s) processado(s)")
                registo[img_hash] = {
                    "arquivo": img_nome,
                    "data": datetime.now().isoformat(),
                    "jogos": jogos_processados
                }
                processadas_com_sucesso += 1
                idx += 1
            else:
                print(f"   ⚠️ Nenhum jogo válido encontrado")
                idx += 1

            guardar_registo(registo)

        except Exception as e:
            print(f"   ❌ Erro: {e}")
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                marcar_chave_esgotada(key_id)
                print(f"   🔄 A tentar novamente a mesma imagem com outra chave...")
            else:
                print(f"   ⚠️ Erro não relacionado com cota. A avançar para próxima imagem.")
                idx += 1

        if idx < len(imagens_nao_processadas):
            print(f"   ⏱️  Aguardar {SEGUNDOS_ENTRE_REQUISICOES:.0f}s...")

    print(f"\n{'='*50}")
    print(f"🏁 PROCESSAMENTO CONCLUÍDO")
    print(f"{'='*50}")
    print(f"✅ Processadas hoje: {processadas_com_sucesso}")
    print(f"📊 Total na pasta: {len(imagens)} imagens")
    print(f"📅 Restantes: {len(imagens_nao_processadas) - processadas_com_sucesso} imagens")

    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    print(f"\n🔑 Estado das chaves hoje ({hoje}):")
    for idx in range(len(GEMINI_KEYS)):
        key_id = f"key_{idx+1}"
        registo_chave = cota_chaves.get(key_id, {"usadas": 0})
        usadas = registo_chave["usadas"] if registo_chave.get("data") == hoje else 0
        print(f"   {key_id}: {usadas}/20")

# ===== APOIO =====
def gerar_hash(caminho):
    h = hashlib.md5()
    with open(caminho, "rb") as f:
        h.update(f.read())
    return h.hexdigest()

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
        'Euromilhões': 'euromilhoes',
        'Eurodreams': 'eurodreams',
        'Totoloto': 'totoloto',
        'M1lhão': 'milhao'
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

# ===== ENTRADA =====
if __name__ == "__main__":
    processar_com_multiplas_chaves()
