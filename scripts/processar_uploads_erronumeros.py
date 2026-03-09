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

# ===== CONFIGURAÇÃO DAS CHAVES =====
# Lista de chaves: a primeira é a atual (GEMINI_API_KEY)
GEMINI_KEYS = [
    os.getenv("GEMINI_API_KEY"),     # Chave 1 (atual)
    os.getenv("GEMINI_API_KEY_2"),   # Chave 2
    os.getenv("GEMINI_API_KEY_3")    # Chave 3
]

# Filtrar chaves vazias
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

# Queue para controlar timestamps
timestamps = deque(maxlen=REQUISICOES_POR_MINUTO)
lock = threading.Lock()

# ===== FUNÇÕES DE CONTROLO DE CHAVES =====
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

def marcar_chave_esgotada(key_id):
    """Marca uma chave como esgotada (20/20) após erro 429"""
    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    
    cota_chaves[key_id] = {
        "data": hoje,
        "usadas": 20
    }
    
    guardar_cota_chaves(cota_chaves)
    print(f"   ⚠️ {key_id} marcada como esgotada (20/20)")

# ===== FUNÇÕES DE RATE LIMIT =====
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

# ===== FUNÇÃO: GERAR THUMBNAIL =====
def gerar_thumbnail(caminho_original, nome_arquivo):
    """Gera uma thumbnail (máx 800px no lado maior) da imagem original e guarda em PASTA_THUMBNAILS"""
    os.makedirs(PASTA_THUMBNAILS, exist_ok=True)
    try:
        img = Image.open(caminho_original)
        # Aplicar orientação EXIF para que a imagem fique na orientação correta
        img = ImageOps.exif_transpose(img)
        # Redimensionar mantendo proporção, limite de 800px no lado maior
        img.thumbnail((800, 800))
        caminho_thumb = os.path.join(PASTA_THUMBNAILS, nome_arquivo)
        img.save(caminho_thumb, optimize=True, quality=85)
        print(f"   🖼️ Thumbnail gerada: {nome_arquivo}")
    except Exception as e:
        print(f"   ⚠️ Erro ao gerar thumbnail: {e}")

# ===== PREPROCESSAMENTO DE IMAGEM =====
def preprocessar_imagem(caminho, img_nome):
    """Gera 3 versões estratégicas da imagem"""
    os.makedirs(PASTA_PREPROCESSADAS, exist_ok=True)
    
    img = cv2.imread(caminho)
    if img is None:
        raise ValueError(f"Imagem não pode ser lida: {caminho}")
    
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

# ===== PROMPT DO GEMINI (ATUALIZADO) =====
PROMPT_FINAL = """
Tu és um especialista em extração de boletins da Santa Casa da Misericórdia de Lisboa.

Vais receber {num_versoes} versões da MESMA área do boletim (apenas a zona relevante do jogo).
A tua missão é extrair a informação MAIS PRECISA possível, com ZERO ERROS nos dígitos.

====================================================================
IDENTIFICAÇÃO DO TIPO DE JOGO (OBRIGATÓRIO)
====================================================================
Antes de extrair qualquer número, identifica o tipo de jogo observando o layout:

- EUROMILHÕES → tem linhas “N” (5 números) e “E” (2 estrelas).
- TOTOLOTO → tem 5 números + “NÚMERO DA SORTE”.
- EURODREAMS → tem linha “N” (6 números) + linha “S” (1 Dream Number).
- M1LHÃO → tem apenas um código alfanumérico (ex: “GTP11668”).

Depois de identificar o tipo de jogo, aplica APENAS as regras desse jogo.
NUNCA inventes campos que não existam no jogo identificado.

====================================================================
COMPARAÇÃO ENTRE IMAGENS (OBRIGATÓRIO)
====================================================================
PASSO 1 — Extrai os números/campos da Imagem 1 (versão nítida).
PASSO 2 — Extrai os números/campos da Imagem 2 (versão original).
PASSO 3 — Compara os resultados.
PASSO 4 — Se forem iguais, usa esse valor.
PASSO 5 — Se forem diferentes, analisa a forma geométrica dos dígitos:
  - '3' tem aberturas laterais; '8' é fechado.
  - '6' tem topo aberto; '8' tem dois círculos fechados.
  - '0' é oval; '8' tem cruzamento interno.
  - '1' é barra vertical; '7' tem barra horizontal no topo.
PASSO 6 — Nunca inventes valores que não apareçam em nenhuma das imagens.
PASSO 7 — Se continuares com dúvida, escolhe o valor que aparece mais vezes.

====================================================================
REGRAS ABSOLUTAS DE DÍGITOS
====================================================================
- Todos os números têm SEMPRE 2 dígitos: “01”, “07”, “12”.
- Nunca inventes números, estrelas, Dream Number ou Número da Sorte.
- Se um número > 50 aparecer, reverifica (exceto Totoloto até 49 e EuroDreams até 40).
- No Euromilhões, estrelas são SEMPRE de 01 a 12.

====================================================================
REGRAS POR JOGO
====================================================================

EUROMILHÕES:
- Linha “N”: 5 números.
- Linha “E”: 2 estrelas.
- Se encontrares 7 números, os 2 últimos são SEMPRE as estrelas.
- Nunca devolver estrelas se não existirem na imagem.

TOTOLOTO:
- 5 números principais.
- “NÚMERO DA SORTE”: 1 número.
- Nunca devolver estrelas neste jogo.

EURODREAMS:
- Linha “N”: 6 números.
- Linha “S”: 1 Dream Number.
- Nunca devolver estrelas neste jogo.

M1LHÃO:
- Apenas um código alfanumérico (ex: “GTP11668”).
- Nunca devolver números, estrelas ou Dream Number.

====================================================================
CAMPOS COMUNS (TODOS OS JOGOS)
====================================================================
- "data_sorteio": YYYY-MM-DD
- "data_aposta": YYYY-MM-DD
- "data_emissao": YYYY-MM-DD HH:MM:SS
- "referencia_unica": código do rodapé
- "concurso": "NNN/AAAA"
- "valor_total": decimal (ex: 2.20)
- "valido": true

====================================================================
ESTRUTURA JSON OBRIGATÓRIA
====================================================================
{
  "jogos": [
    {
      "tipo": "...",
      "data_sorteio": "...",
      "data_aposta": "...",
      "data_emissao": "...",
      "referencia_unica": "...",
      "concurso": "...",
      "valor_total": ...,
      "valido": true,
      "apostas": [
        {
          "indice": 1,
          "numeros": [...],
          "estrelas": [...],
          "numero_da_sorte": "...",
          "dream_number": "...",
          "codigo": "..."
        }
      ]
    }
  ]
}

Inclui APENAS os campos que pertencem ao jogo identificado.
Retorna APENAS JSON válido, sem texto adicional.

"""

# ===== FUNÇÃO PRINCIPAL DE PROCESSAMENTO =====
def processar_com_multiplas_chaves():
    """Processa imagens usando múltiplas chaves em rodízio"""
    # Criar pastas necessárias
    os.makedirs(PASTA_DADOS, exist_ok=True)
    os.makedirs(PASTA_UPLOADS, exist_ok=True)
    os.makedirs(PASTA_PREPROCESSADAS, exist_ok=True)
    os.makedirs(PASTA_THUMBNAILS, exist_ok=True)

    # Carregar registo de imagens processadas
    registo = carregar_registo()
    
    # Listar imagens na pasta uploads
    imagens = [f for f in os.listdir(PASTA_UPLOADS) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
    
    if not imagens:
        print("📭 Nenhuma imagem encontrada na pasta uploads/")
        return
    
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
    print(f"🔑 {len(GEMINI_KEYS)} chaves disponíveis (limite total: {len(GEMINI_KEYS) * 20}/dia)")
    print(f"⏱️  Rate limit minuto: {REQUISICOES_POR_MINUTO} req/min\n")
    
    processadas_com_sucesso = 0
    
    # Processar cada imagem
    idx = 0
    while idx < len(imagens_nao_processadas):
        img_nome, caminho, img_hash = imagens_nao_processadas[idx]
        
        print(f"[{idx+1}/{len(imagens_nao_processadas)}] 🚀 {img_nome}")
        
        # Gerar thumbnail da imagem original
        gerar_thumbnail(caminho, img_nome)
        
        # OBTER CLIENTE COM CHAVE DISPONÍVEL
        cliente, key_id, usadas_atual = obter_cliente_disponivel()
        
        if not cliente:
            print(f"\n🚫 TODAS AS CHAVES ESGOTADAS! ({len(GEMINI_KEYS)} * 20 = {len(GEMINI_KEYS)*20} requisições)")
            print(f"   Processadas hoje: {processadas_com_sucesso}")
            print(f"   Restantes: {len(imagens_nao_processadas) - idx} imagens")
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
            
            # ========== DEBUG: Imprimir resposta bruta ==========
            resposta_texto = resposta.text
            print("\n📦 RESPOSTA BRUTA DO GEMINI:")
            print(resposta_texto)
            print("-" * 50)
            # ===================================================
            
            # REGISTAR USO DA CHAVE COM SUCESSO
            registar_uso_chave(key_id, usadas_atual)
            
            # PROCESSAR resposta
            dados = json.loads(resposta_texto)
            
            # Adicionar campo confirmado = false a cada jogo
            for jogo in dados.get("jogos", []):
                jogo["confirmado"] = False
            
            jogos_processados = 0
            for jogo in dados.get("jogos", []):
                # ===== VALIDAÇÃO ADICIONAL POR TIPO =====
                if jogo["tipo"] == "M1lhão":
                    # Verifica se existe pelo menos uma aposta com código não vazio
                    if not any(aposta.get("codigo") for aposta in jogo.get("apostas", [])):
                        print(f"   ⚠️ Ignorado M1lhão sem código na imagem {img_nome}")
                        continue
                elif jogo["tipo"] in ["Euromilhões", "Totoloto", "Eurodreams"]:
                    # (opcional) futuras validações podem ser adicionadas aqui
                    pass
                # ========================================
                
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
                idx += 1  # Avança para próxima imagem apenas em caso de sucesso
            else:
                print(f"   ⚠️ Nenhum jogo válido encontrado")
                idx += 1  # Avança mesmo sem jogos (imagem processada mas sem dados)
            
            # Guardar registo a cada imagem (segurança)
            guardar_registo(registo)
            
        except Exception as e:
            print(f"   ❌ Erro: {e}")
            
            # Se for erro de cota, marcar chave como esgotada e REPETIR a mesma imagem
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                marcar_chave_esgotada(key_id)
                print(f"   🔄 A tentar novamente a mesma imagem com outra chave...")
                # Não incrementa idx - repete a mesma imagem
            else:
                # Outros erros, avançar para próxima imagem
                print(f"   ⚠️ Erro não relacionado com cota. A avançar para próxima imagem.")
                idx += 1
        
        # Mostrar progresso (se não for a última)
        if idx < len(imagens_nao_processadas):
            print(f"   ⏱️  Aguardar {SEGUNDOS_ENTRE_REQUISICOES:.0f}s...")
    
    # RELATÓRIO FINAL
    print(f"\n{'='*50}")
    print(f"🏁 PROCESSAMENTO CONCLUÍDO")
    print(f"{'='*50}")
    print(f"✅ Processadas hoje: {processadas_com_sucesso}")
    print(f"📊 Total na pasta: {len(imagens)} imagens")
    print(f"📅 Restantes: {len(imagens_nao_processadas) - processadas_com_sucesso} imagens")
    
    # Mostrar estado das chaves
    cota_chaves = carregar_cota_chaves()
    hoje = datetime.now().strftime("%Y-%m-%d")
    print(f"\n🔑 Estado das chaves hoje ({hoje}):")
    for idx in range(len(GEMINI_KEYS)):
        key_id = f"key_{idx+1}"
        registo_chave = cota_chaves.get(key_id, {"usadas": 0})
        usadas = registo_chave["usadas"] if registo_chave.get("data") == hoje else 0
        print(f"   {key_id}: {usadas}/20")

# ===== FUNÇÕES DE APOIO =====
def gerar_hash(caminho):
    """Gera hash MD5 de um ficheiro"""
    h = hashlib.md5()
    with open(caminho, "rb") as f:
        h.update(f.read())
    return h.hexdigest()

def carregar_registo():
    """Carrega registo de imagens processadas"""
    if os.path.exists(FICHEIRO_REGISTO):
        with open(FICHEIRO_REGISTO, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def guardar_registo(reg):
    """Guarda registo de imagens processadas"""
    with open(FICHEIRO_REGISTO, "w", encoding="utf-8") as f:
        json.dump(reg, f, indent=4, ensure_ascii=False)

def limpar_nome_jogo(nome):
    """Converte nome do jogo para nome de ficheiro"""
    mapping = {
        'Euromilhões': 'euromilhoes',
        'Eurodreams': 'eurodreams',
        'Totoloto': 'totoloto',
        'M1lhão': 'milhao'
    }
    return mapping.get(nome, nome.lower().strip().replace(" ", "_"))

def guardar_jogo(jogo, img_nome, img_hash):
    """Guarda um jogo no ficheiro correspondente ao tipo"""
    if not jogo.get("tipo"): 
        return False
    
    nome_ficheiro = f"{limpar_nome_jogo(jogo['tipo'])}.json"
    caminho = os.path.join(PASTA_DADOS, nome_ficheiro)
    
    # Carregar histórico existente
    if os.path.exists(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            historico = json.load(f)
    else:
        historico = []

    # Verificar duplicados por referência única
    ref = jogo.get("referencia_unica")
    if ref and any(item.get("referencia_unica") == ref for item in historico):
        print(f"   ⚠️ Referência {ref} já registada")
        return False

    # Adicionar metadados
    jogo["imagem_origem"] = img_nome
    jogo["hash_imagem"] = img_hash
    jogo["data_processamento"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    historico.append(jogo)

    # Guardar
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(historico, f, indent=4, ensure_ascii=False)
    
    return True

# ===== PONTO DE ENTRADA =====
if __name__ == "__main__":
    processar_com_multiplas_chaves()
