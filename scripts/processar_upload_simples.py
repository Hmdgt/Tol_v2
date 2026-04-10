import os
import json
import hashlib
import time
from PIL import Image, ImageOps
from datetime import datetime
from google import genai
from collections import deque
import threading

# ===== CONFIGURAÇÃO =====
MODELOS_FALLBACK = [
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash",
]

GEMINI_KEYS = [
    os.getenv("GEMINI_API_KEY"),
    os.getenv("GEMINI_API_KEY_2"),
    os.getenv("GEMINI_API_KEY_3"),
]
GEMINI_KEYS = [key for key in GEMINI_KEYS if key]

if not GEMINI_KEYS:
    raise ValueError("❌ Nenhuma chave Gemini encontrada!")

print("🔑 Chaves encontradas:", len(GEMINI_KEYS))

FICHEIRO_COTA_CHAVES = "apostas/cota_por_chave.json"
FICHEIRO_REGISTO = "apostas/registo_processamento.json"
PASTA_UPLOADS = "uploads/"
PASTA_DADOS = "apostas/"
PASTA_THUMBNAILS = "thumbnails/"

REQUISICOES_POR_MINUTO = 5
SEGUNDOS_ENTRE_REQUISICOES = 60 / REQUISICOES_POR_MINUTO
timestamps = deque(maxlen=REQUISICOES_POR_MINUTO)
lock = threading.Lock()
ultima_chave_idx = -1

# ===== CONTROLO DE CHAVES =====
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
            print(f"   🔑 {key_id} ({registo['usadas']+1}/20)")
            return genai.Client(api_key=GEMINI_KEYS[idx]), key_id, registo["usadas"] + 1
    return None, None, None

def registar_uso_chave(key_id, usadas):
    cota = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    cota[key_id] = {"data": hoje, "usadas": usadas}
    guardar_cota_chaves(cota)

def marcar_chave_esgotada(key_id):
    cota = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    cota[key_id] = {"data": hoje, "usadas": 20}
    guardar_cota_chaves(cota)

def esperar_rate_limit():
    with lock:
        agora = time.time()
        while timestamps and timestamps[0] < agora - 60:
            timestamps.popleft()
        if len(timestamps) >= REQUISICOES_POR_MINUTO:
            espera = 60 - (agora - timestamps[0])
            if espera > 0:
                print(f"   ⏳ Aguardar {espera:.1f}s (rate limit)")
                time.sleep(espera)
        timestamps.append(time.time())

# ===== IMAGEM =====
def gerar_hash(caminho):
    h = hashlib.md5()
    with open(caminho, "rb") as f:
        h.update(f.read())
    return h.hexdigest()

def gerar_thumbnail(caminho, nome):
    os.makedirs(PASTA_THUMBNAILS, exist_ok=True)
    try:
        img = Image.open(caminho)
        img = ImageOps.exif_transpose(img)
        img.thumbnail((800, 800))
        img.save(os.path.join(PASTA_THUMBNAILS, nome), optimize=True, quality=85)
    except Exception as e:
        print(f"   ⚠️ Thumbnail: {e}")

def preparar_imagem(caminho):
    img = Image.open(caminho)
    img = ImageOps.exif_transpose(img)
    if max(img.size) > 1600:
        img.thumbnail((1600, 1600))
    return img

# ===== PROMPT (mantém o teu) =====
PROMPT_FINAL = """... (coloca aqui o teu prompt completo) ..."""

# ===== GESTÃO DE JOGOS =====
def carregar_registo():
    if os.path.exists(FICHEIRO_REGISTO):
        with open(FICHEIRO_REGISTO, "r") as f:
            return json.load(f)
    return {}

def guardar_registo(reg):
    with open(FICHEIRO_REGISTO, "w") as f:
        json.dump(reg, f, indent=4)

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
        print(f"   ⚠️ Ref {ref} já existe. A saltar.")
        return False

    jogo["imagem_origem"] = img_nome
    jogo["hash_imagem"] = img_hash
    jogo["data_processamento"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    jogo["confirmado"] = False

    historico.append(jogo)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(historico, f, indent=4, ensure_ascii=False)
    return True

# ===== PROCESSAMENTO PRINCIPAL =====
def processar_com_multiplas_chaves():
    for p in [PASTA_DADOS, PASTA_UPLOADS, PASTA_THUMBNAILS]:
        os.makedirs(p, exist_ok=True)

    registo = carregar_registo()
    imagens = [f for f in os.listdir(PASTA_UPLOADS) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
    if not imagens:
        print("📭 Nenhuma imagem.")
        return

    pendentes = []
    for img in imagens:
        caminho = os.path.join(PASTA_UPLOADS, img)
        h = gerar_hash(caminho)
        if h not in registo:
            pendentes.append((img, caminho, h))

    if not pendentes:
        print("📭 Nenhuma imagem nova.")
        return

    print(f"\n📊 {len(pendentes)} imagens novas")

    processadas = 0
    for idx, (img_nome, caminho, img_hash) in enumerate(pendentes):
        print(f"\n🚀 [{idx+1}/{len(pendentes)}] {img_nome}")
        gerar_thumbnail(caminho, img_nome)
        try:
            img_pil = preparar_imagem(caminho)
        except Exception as e:
            print(f"   ❌ Erro imagem: {e}")
            continue

        sucesso = False
        for modelo in MODELOS_FALLBACK:
            if sucesso:
                break
            tentativas = 3
            while tentativas > 0 and not sucesso:
                cliente, key_id, usadas = obter_cliente_disponivel()
                if not cliente:
                    break
                try:
                    esperar_rate_limit()
                    print(f"   🤖 {modelo} | {key_id}")
                    resp = cliente.models.generate_content(
                        model=modelo,
                        contents=[PROMPT_FINAL, img_pil],
                        config={"temperature": 0, "response_mime_type": "application/json"}
                    )
                    registar_uso_chave(key_id, usadas)
                    dados = json.loads(resp.text)
                    jogos_ok = 0
                    for jogo in dados.get("jogos", []):
                        if guardar_jogo(jogo, img_nome, img_hash):
                            jogos_ok += 1
                    if jogos_ok > 0:
                        print(f"   ✅ {jogos_ok} jogo(s)")
                        registo[img_hash] = {"arquivo": img_nome, "data": datetime.now().isoformat(), "jogos": jogos_ok}
                        guardar_registo(registo)
                        processadas += 1
                        sucesso = True
                    else:
                        print("   ⚠️ Nenhum jogo válido (ou duplicado)")
                        sucesso = True  # marca como processada para não repetir
                except Exception as e:
                    erro = str(e).upper()
                    print(f"   ❌ {e}")
                    if "429" in erro or "RESOURCE_EXHAUSTED" in erro:
                        marcar_chave_esgotada(key_id)
                    elif "503" in erro or "UNAVAILABLE" in erro:
                        tentativas -= 1
                        if tentativas > 0:
                            time.sleep(5)
                    else:
                        break
        if not sucesso:
            print(f"   ❌ Falhou todos os modelos.")

        if idx < len(pendentes) - 1:
            time.sleep(SEGUNDOS_ENTRE_REQUISICOES)

    print(f"\n✅ Processadas: {processadas}")

if __name__ == "__main__":
    processar_com_multiplas_chaves()
