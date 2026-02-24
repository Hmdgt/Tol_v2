import os
import json
import hashlib
import cv2
import numpy as np
import time
from PIL import Image, ImageEnhance
from datetime import datetime
from google import genai
from collections import deque
import threading

# Configuração
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

PASTA_UPLOADS = "uploads/"
PASTA_DADOS = "apostas/"
PASTA_PREPROCESSADAS = "preprocessadas/"
FICHEIRO_REGISTO = "apostas/registo_processamento.json"

# Controlo de taxa (5 por minuto = 1 a cada 12 segundos)
REQUISICOES_POR_MINUTO = 5
SEGUNDOS_ENTRE_REQUISICOES = 60 / REQUISICOES_POR_MINUTO  # 12 segundos

# Queue para controlar timestamps das requisições
timestamps = deque(maxlen=REQUISICOES_POR_MINUTO)
lock = threading.Lock()

def esperar_rate_limit():
    """
    Garante que não excedemos 5 requisições por minuto
    """
    with lock:
        agora = time.time()
        
        # Remover timestamps mais antigos que 60 segundos
        while timestamps and timestamps[0] < agora - 60:
            timestamps.popleft()
        
        # Se já fizemos 5 requisições no último minuto
        if len(timestamps) >= REQUISICOES_POR_MINUTO:
            # Calcular quanto tempo esperar
            mais_antigo = timestamps[0]
            tempo_espera = 60 - (agora - mais_antigo)
            
            if tempo_espera > 0:
                print(f"  ⏳ Rate limit: a aguardar {tempo_espera:.1f} segundos...")
                time.sleep(tempo_espera)
        
        # Adicionar timestamp atual
        timestamps.append(time.time())

def preprocessar_imagem(caminho, img_nome):
    """Gera 3 versões estratégicas da imagem (para poupar requisições)"""
    os.makedirs(PASTA_PREPROCESSADAS, exist_ok=True)
    
    img = cv2.imread(caminho)
    nome_base = os.path.splitext(img_nome)[0]
    versoes = []
    
    # 1. Original (sempre incluída)
    img_original = Image.open(caminho)
    versoes.append(img_original)
    
    # 2. Binarização (OTSU) - melhor para texto
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    img_binary = Image.fromarray(binary)
    versoes.append(img_binary)
    img_binary.save(os.path.join(PASTA_PREPROCESSADAS, f"{nome_base}_binary.png"))
    
    # 3. Alto contraste + nitidez
    enhancer = ImageEnhance.Contrast(img_original)
    img_contrast = enhancer.enhance(2.5)
    enhancer = ImageEnhance.Sharpness(img_contrast)
    img_sharp = enhancer.enhance(2.0)
    versoes.append(img_sharp)
    img_sharp.save(os.path.join(PASTA_PREPROCESSADAS, f"{nome_base}_enhanced.png"))
    
    print(f"  📸 Geradas {len(versoes)} versões estratégicas")
    return versoes

# PROMPT CONSOLIDADO (VERSÃO FINAL)
PROMPT_FINAL = """
Tu és um especialista em extração de boletins da Santa Casa da Misericórdia de Lisboa.

Estás a ver {num_versoes} versões da MESMA imagem. Compara-as e extrai a informação MAIS PRECISA.

REGRAS ABSOLUTAS:
- Números têm SEMPRE 2 dígitos: "01", "07", "12" (nunca "1", "7", "12")
- Se não tens 100% certeza, usa o valor que aparece em MÚLTIPLAS versões
- NUNCA inventes números ou estrelas

PADRÕES EXATOS POR JOGO:

EUROMILHÕES:
- Formato 1 (só números): "1.N E 87 17 18 23 25" → ignora o "E", extrai 5 números, estrelas = []
- Formato 2 (com estrelas): "1.N 01 14 20 21 32" (linha 1) + "E 05 07" (linha 2) → números + estrelas

EURODREAMS:
- Linha 1: "1.N 01 09 14 17 22 26" → 6 números
- Linha 2: "S 04" → dream number

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
- "valor_total": decimal (ex: 2.20)
- "valido": true

ESTRUTURA JSON OBRIGATÓRIA:
{
  "jogos": [
    {
      "tipo": "Euromilhões",
      "data_sorteio": "2026-02-20",
      "data_aposta": "2026-02-20",
      "data_emissao": "2026-02-20 08:37:32",
      "referencia_unica": "551-05455705-M1L",
      "valor_total": 2.20,
      "valido": true,
      "apostas": [
        {
          "indice": 1,
          "numeros": ["04", "09", "30", "33", "37"],
          "estrelas": []
        }
      ]
    }
  ]
}

Retorna APENAS JSON válido, sem texto adicional.
"""

def processar_com_rate_limit():
    """Processa imagens respeitando o limite de 5/min"""
    os.makedirs(PASTA_DADOS, exist_ok=True)
    os.makedirs(PASTA_UPLOADS, exist_ok=True)
    os.makedirs(PASTA_PREPROCESSADAS, exist_ok=True)

    registo = carregar_registo()
    imagens = [f for f in os.listdir(PASTA_UPLOADS) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
    
    # Filtrar apenas imagens não processadas
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
    print(f"⏱️  Rate limit: {REQUISICOES_POR_MINUTO} req/min → {SEGUNDOS_ENTRE_REQUISICOES:.1f} segundos entre cada\n")
    
    for idx, (img_nome, caminho, img_hash) in enumerate(imagens_nao_processadas, 1):
        print(f"[{idx}/{len(imagens_nao_processadas)}] 🚀 A processar: {img_nome}")
        
        try:
            # GERAR VERSÕES (sem gastar requisições)
            versoes = preprocessar_imagem(caminho, img_nome)
            
            # ESPERAR pelo rate limit ANTES de enviar
            esperar_rate_limit()
            
            # ENVIAR para o Gemini
            prompt = PROMPT_FINAL.replace("{num_versoes}", str(len(versoes)))
            
            resposta = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[prompt] + versoes,
                config={
                    "temperature": 0,
                    "response_mime_type": "application/json"
                }
            )
            
            # PROCESSAR resposta
            dados = json.loads(resposta.text)
            
            jogos_processados = 0
            for jogo in dados.get("jogos", []):
                if guardar_jogo(jogo, img_nome, img_hash):
                    jogos_processados += 1
            
            if jogos_processados > 0:
                print(f"  ✅ {jogos_processados} jogo(s) processado(s)")
                registo[img_hash] = {
                    "arquivo": img_nome,
                    "data": datetime.now().isoformat(),
                    "jogos": jogos_processados
                }
            else:
                print(f"  ⚠️ Nenhum jogo válido encontrado")
            
            # Se não for a última imagem, mostrar contagem decrescente
            if idx < len(imagens_nao_processadas):
                proxima = SEGUNDOS_ENTRE_REQUISICOES
                print(f"  ⏱️  Próxima imagem em {proxima:.0f} segundos...")
            
        except Exception as e:
            print(f"  ❌ Erro: {e}")
            
            # Em caso de erro, esperar mesmo assim para não queimar rate limit
            if idx < len(imagens_nao_processadas):
                print(f"  ⏱️  A aguardar {SEGUNDOS_ENTRE_REQUISICOES:.0f}s antes de continuar...")
                time.sleep(SEGUNDOS_ENTRE_REQUISICOES)
    
    guardar_registo(registo)
    print("\n🏁 Processamento concluído!")

# ---------------------------------------------------------
# FUNÇÕES DE APOIO (mantêm-se iguais)
# ---------------------------------------------------------

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
        print(f"  ⚠️ Referência {ref} já registada")
        return False

    jogo["imagem_origem"] = img_nome
    jogo["hash_imagem"] = img_hash
    jogo["data_processamento"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    historico.append(jogo)

    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(historico, f, indent=4, ensure_ascii=False)
    
    return True

if __name__ == "__main__":
    processar_com_rate_limit()
