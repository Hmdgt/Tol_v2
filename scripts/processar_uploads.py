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

# ===== CONFIGURAÇÃO DAS CHAVES =====
# Lista de chaves: a primeira é a atual (GEMINI_API_KEY)
GEMINI_KEYS = [
    os.getenv("GEMINI_API_KEY"),     # Chave 1 (atual)
    os.getenv("GEMINI_API_KEY_2"),   # Chave 2
    os.getenv("GEMINI_API_KEY_3")    # Chave 3
]

# Filtrar chaves vazias
GEMINI_KEYS = [key for key in GEMINI_KEYS if key]

if not GEMINI_KEYS:
    raise ValueError("❌ Nenhuma chave Gemini encontrada!")

print(f"🔑 Carregadas {len(GEMINI_KEYS)} chaves Gemini")

# Cliente inicial (será trocado conforme necessário)
client = genai.Client(api_key=GEMINI_KEYS[0])

# ===== NOVO: Controlo de cota por chave =====
FICHEIRO_COTA_CHAVES = "apostas/cota_por_chave.json"
FICHEIRO_REGISTO = "apostas/registo_processamento.json"

# Pastas
PASTA_UPLOADS = "uploads/"
PASTA_DADOS = "apostas/"
PASTA_PREPROCESSADAS = "preprocessadas/"

# Controlo de taxa (5 por minuto)
REQUISICOES_POR_MINUTO = 5
SEGUNDOS_ENTRE_REQUISICOES = 60 / REQUISICOES_POR_MINUTO

# Queue para controlar timestamps
timestamps = deque(maxlen=REQUISICOES_POR_MINUTO)
lock = threading.Lock()

def carregar_cota_chaves():
    """Carrega o estado de cada chave"""
    if os.path.exists(FICHEIRO_COTA_CHAVES):
        with open(FICHEIRO_COTA_CHAVES, "r") as f:
            return json.load(f)
    return {}

def guardar_cota_chaves(cota):
    with open(FICHEIRO_COTA_CHAVES, "w") as f:
        json.dump(cota, f, indent=2)

def obter_cliente_disponivel():
    """
    Retorna um cliente Gemini com uma chave que ainda tem cota hoje
    """
    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    
    # Tentar chaves por ordem (1, 2, 3) mas apenas se tiverem cota
    for idx, key in enumerate(GEMINI_KEYS):
        key_id = f"key_{idx+1}"
        
        # Obter registo desta chave
        registo = cota_chaves.get(key_id, {"data": "", "usadas": 0})
        
        # Reset se for novo dia
        if registo["data"] != hoje:
            registo = {"data": hoje, "usadas": 0}
        
        # Se ainda tem cota (limite 20 por dia)
        if registo["usadas"] < 20:
            print(f"   🔑 Usando {key_id} ({registo['usadas'] + 1}/20 hoje)")
            return genai.Client(api_key=key), key_id, registo["usadas"] + 1
    
    # Se chegou aqui, todas as chaves esgotaram
    return None, None, None

def registar_uso_chave(key_id, usadas_atualizadas):
    """Regista uma requisição bem sucedida"""
    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    
    cota_chaves[key_id] = {
        "data": hoje,
        "usadas": usadas_atualizadas
    }
    
    guardar_cota_chaves(cota_chaves)

def esperar_rate_limit():
    """Garante que não excedemos 5 requisições por minuto"""
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

def preprocessar_imagem(caminho, img_nome):
    """Gera 3 versões estratégicas da imagem"""
    os.makedirs(PASTA_PREPROCESSADAS, exist_ok=True)
    
    img = cv2.imread(caminho)
    nome_base = os.path.splitext(img_nome)[0]
    versoes = []
    
    # 1. Original
    img_original = Image.open(caminho)
    versoes.append(img_original)
    
    # 2. Binarização adaptativa
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    img_binary = Image.fromarray(binary)
    versoes.append(img_binary)
    img_binary.save(os.path.join(PASTA_PREPROCESSADAS, f"{nome_base}_binary.png"))
    
    # 3. Alto contraste + nitidez
    enhancer = ImageEnhance.Contrast(img_original)
    img_contrast = enhancer.enhance(3.0)
    enhancer = ImageEnhance.Sharpness(img_contrast)
    img_sharp = enhancer.enhance(2.0)
    versoes.append(img_sharp)
    img_sharp.save(os.path.join(PASTA_PREPROCESSADAS, f"{nome_base}_enhanced.png"))
    
    print(f"   📸 Geradas {len(versoes)} versões")
    return versoes

# PROMPT (igual ao seu, mantive igual)
PROMPT_FINAL = """
Tu és um especialista em extração de boletins da Santa Casa da Misericórdia de Lisboa.

Estás a ver {num_versoes} versões da MESMA imagem. Compara-as e extrai a informação MAIS PRECISA.

REGRAS ABSOLUTAS:
- Números têm SEMPRE 2 dígitos: "01", "07", "12" (nunca "1", "7", "12")
- Se não tens 100% certeza, usa o valor que aparece em MÚLTIPLAS versões
- NUNCA inventes números ou estrelas

PADRÕES EXATOS POR JOGO:

EUROMILHÕES (Regras de Ouro):
1. Identifica os blocos de apostas (1., 2., etc.).
2. NÚMEROS (N): São os 5 números principais encontrados na linha do "N".
3. ESTRELAS (E): São os 2 números que aparecem na linha imediatamente abaixo do "N", geralmente precedidos por "E".
4. REGRA DE SEGURANÇA MÁXIMA: Um jogo de Euromilhões NUNCA tem 0 estrelas. Se extraíres 5 números e o campo 'estrelas' estiver vazio, procura na imagem pelos dois números pequenos que faltam na linha de baixo.
5. Se encontrares 7 números no total para a mesma aposta, os 2 últimos são SEMPRE as estrelas.

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
          "estrelas": ["01", "05"]
        }
      ]
    }
  ]
}

Retorna APENAS JSON válido, sem texto adicional.
"""

def processar_com_multiplas_chaves():
    """Processa imagens usando múltiplas chaves em rodízio"""
    os.makedirs(PASTA_DADOS, exist_ok=True)
    os.makedirs(PASTA_UPLOADS, exist_ok=True)
    os.makedirs(PASTA_PREPROCESSADAS, exist_ok=True)

    registo = carregar_registo()
    imagens = [f for f in os.listdir(PASTA_UPLOADS) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
    
    # Filtrar apenas imagens não processadas (JÁ EXISTE!)
    imagens_nao_processadas = []
    for img_nome in imagens:
        caminho = os.path.join(PASTA_UPLOADS, img_nome)
        img_hash = gerar_hash(caminho)
        if img_hash not in registo:  # ← VERIFICAÇÃO DE DUPLICADOS
            imagens_nao_processadas.append((img_nome, caminho, img_hash))
    
    if not imagens_nao_processadas:
        print("📭 Nenhuma imagem nova para processar.")
        return
    
    print(f"\n📊 Encontradas {len(imagens_nao_processadas)} imagens para processar")
    print(f"🔑 {len(GEMINI_KEYS)} chaves disponíveis (limite total: {len(GEMINI_KEYS) * 20}/dia)")
    print(f"⏱️  Rate limit minuto: {REQUISICOES_POR_MINUTO} req/min\n")
    
    processadas_com_sucesso = 0
    imagens_falhadas = []
    
    for idx, (img_nome, caminho, img_hash) in enumerate(imagens_nao_processadas, 1):
        print(f"[{idx}/{len(imagens_nao_processadas)}] 🚀 {img_nome}")
        
        # ===== OBTER CLIENTE COM CHAVE DISPONÍVEL =====
        cliente, key_id, usadas_atual = obter_cliente_disponivel()
        
        if not cliente:
            print(f"\n🚫 TODAS AS CHAVES ESGOTADAS! ({len(GEMINI_KEYS)} * 20 = {len(GEMINI_KEYS)*20} requisições)")
            print(f"   Processadas hoje: {processadas_com_sucesso}")
            print(f"   Restantes: {len(imagens_nao_processadas) - idx + 1} imagens")
            break
        
        try:
            # GERAR VERSÕES
            versoes = preprocessar_imagem(caminho, img_nome)
            
            # ESPERAR rate limit minuto
            esperar_rate_limit()
            
            # ENVIAR para o Gemini com a chave atual
            prompt = PROMPT_FINAL.replace("{num_versoes}", str(len(versoes)))
            
            resposta = cliente.models.generate_content(
                model="gemini-2.5-flash",
                contents=[prompt] + versoes,
                config={
                    "temperature": 0,
                    "response_mime_type": "application/json"
                }
            )
            
            # ===== REGISTAR USO DA CHAVE COM SUCESSO =====
            registar_uso_chave(key_id, usadas_atual)
            
            # PROCESSAR resposta
            dados = json.loads(resposta.text)
            
            jogos_processados = 0
            for jogo in dados.get("jogos", []):
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
            else:
                print(f"   ⚠️ Nenhum jogo válido encontrado")
            
            # Guardar registo a cada imagem (segurança)
            guardar_registo(registo)
            
        except Exception as e:
            print(f"   ❌ Erro: {e}")
            
            # Se for erro de cota, marcar esta chave como esgotada
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                print(f"   ⚠️ {key_id} esgotada! Marcando como 20/20")
                # Forçar registo como esgotada
                cota_chaves = carregar_cota_chaves()
                hoje = datetime.now().strftime("%Y-%m-%d")
                cota_chaves[key_id] = {"data": hoje, "usadas": 20}
                guardar_cota_chaves(cota_chaves)
                
                # Tentar novamente esta imagem com outra chave
                print(f"   🔄 A tentar novamente com outra chave...")
                # O loop vai continuar e na próxima iteração (mesmo índice) 
                # vai pegar outra chave graças ao continue
                imagens_falhadas.append((img_nome, caminho, img_hash))
            else:
                # Outros erros, guardar para tentar depois
                imagens_falhadas.append((img_nome, caminho, img_hash))
        
        # Mostrar progresso
        if idx < len(imagens_nao_processadas):
            print(f"   ⏱️  Aguardar {SEGUNDOS_ENTRE_REQUISICOES:.0f}s...")
    
    # Relatório final
    print(f"\n{'='*50}")
    print(f"🏁 PROCESSAMENTO CONCLUÍDO")
    print(f"{'='*50}")
    print(f"✅ Processadas hoje: {processadas_com_sucesso}")
    print(f"⏳ Falhadas: {len(imagens_falhadas)}")
    
    if imagens_falhadas:
        print(f"\n📋 Imagens com erro (serão tentadas novamente na próxima execução):")
        for img_nome, _, _ in imagens_falhadas[:5]:  # Mostrar só 5
            print(f"   - {img_nome}")
        if len(imagens_falhadas) > 5:
            print(f"   ... e mais {len(imagens_falhadas) - 5}")
    
    # Mostrar estado das chaves
    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    print(f"\n🔑 Estado das chaves hoje ({hoje}):")
    for idx in range(len(GEMINI_KEYS)):
        key_id = f"key_{idx+1}"
        registo = cota_chaves.get(key_id, {"usadas": 0})
        usadas = registo["usadas"] if registo.get("data") == hoje else 0
        print(f"   {key_id}: {usadas}/20")

# Funções de apoio (mantive iguais)
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

if __name__ == "__main__":
    processar_com_multiplas_chaves()  # ← Nome da função alterado
