import os
import json
import hashlib
import PIL.Image
from datetime import datetime
from google import genai

# 1. Configuração do Ambiente
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

PASTA_UPLOADS = "uploads/"
PASTA_DADOS = "apostas/"
FICHEIRO_REGISTO = "apostas/registo_processamento.json"

# 2. PROMPT MESTRE (VERSÃO CORRIGIDA COM PADRÕES REAIS)
INSTRUCAO = """
Tu és um sistema de extração estruturada de boletins oficiais da Santa Casa da Misericórdia de Lisboa (Portugal).

------------------------------------------------------------------
FORMATO DOS NÚMEROS (CRÍTICO)
------------------------------------------------------------------
**TODOS OS NÚMEROS** nos boletins portugueses aparecem com **2 dígitos**:
- ✅ "01, 05, 12, 23, 49" (correto)
- ❌ "1, 5, 12, 23, 49" (incorreto)

Extrai SEMPRE os números no formato original: se vires "1" na imagem mas está claramente "01", extrai "01".

------------------------------------------------------------------
MÉTODO DE EXTRAÇÃO POR APOSTAS MÚLTIPLAS
------------------------------------------------------------------
- Cada aposta é identificada por um índice (1., 2., 3., etc.)
- Tudo que está abaixo do índice até ao próximo índice pertence à MESMA aposta

------------------------------------------------------------------
PADRÕES ESPECÍFICOS POR JOGO (BASEADO EM IMAGENS REAIS)
------------------------------------------------------------------

**EUROMILHÕES:**
- Padrão observado: 
  - Linha 1: `{indice}.N {5 números}`  (ex: "1.N 01 14 20 21 32")
  - Linha 2: `E {2 números}`            (ex: "E 05 07")
- O "N" significa Números, o "E" significa Estrelas
- Output: 5 números em "numeros", 2 estrelas em "estrelas"

**EURODREAMS:**
- Padrão observado:
  - Linha 1: `{indice}.N {6 números}`   (ex: "1.N 01 09 14 17 22 26")
  - Linha 2: `S {1 número}`              (ex: "S 04")
- O "N" significa Números, o "S" significa Dream/Sonho
- Output: 6 números em "numeros", 1 dream number em "numero_dream"

**TOTOLOTO:**
- Padrão observado:
  - Linha 1: `{indice}. {5 números}`     (ex: "1. 35 37 40 44 46")
  - Linha 2: `NUMERO DA SORTE {1 número}` (ex: "NUMERO DA SORTE 04")
- Output: 5 números em "numeros", 1 número da sorte em "numero_da_sorte"

**M1LHÃO:**
- Padrão observado: `{3 letras} {5 números}` (ex: "GTP 11668")
- Output: código completo (sem espaço) em "codigo", ex: "GTP11668"

------------------------------------------------------------------
CAMPOS OBRIGATÓRIOS POR TIPO
------------------------------------------------------------------

Para TODOS os jogos:
- "tipo": "Euromilhões", "Eurodreams", "Totoloto", "M1lhão"
- "data_sorteio": YYYY-MM-DD (da linha "SORT {data}" no topo)
- "data_aposta": YYYY-MM-DD (da data no rodapé)
- "data_emissao": YYYY-MM-DD HH:MM:SS (data+hora no rodapé)
- "referencia_unica": código no rodapé (ex: "726-01986439-171")
- "valor_total": decimal (ex: 2.20)
- "valido": true (a menos que haja rasura)

------------------------------------------------------------------
ESTRUTURA JSON EXATA (NÃO INVENTES CAMPOS)
------------------------------------------------------------------

**Euromilhões:**
{
  "jogos": [{
    "tipo": "Euromilhões",
    "data_sorteio": "2025-08-15",
    "data_aposta": "2025-08-14",
    "data_emissao": "2025-08-14 14:53:32",
    "referencia_unica": "726-01986439-171",
    "valor_total": 2.20,
    "valido": true,
    "apostas": [
      {
        "indice": 1,
        "numeros": ["87", "17", "18", "23", "25"],
        "estrelas": []  // array vazio se não houver estrelas visíveis
      }
    ]
  }]
}

**Eurodreams:**
{
  "jogos": [{
    "tipo": "Eurodreams",
    "data_sorteio": "2026-02-19",
    "data_aposta": "2026-02-17",
    "data_emissao": "2026-02-17 17:02:32",
    "referencia_unica": "260217-17-2156263608-098",
    "valor_total": 2.50,
    "valido": true,
    "apostas": [
      {
        "indice": 1,
        "numeros": ["01", "09", "14", "17", "22", "26"],
        "numero_dream": "04"
      }
    ]
  }]
}

**Totoloto:**
{
  "jogos": [{
    "tipo": "Totoloto",
    "data_sorteio": "2026-02-25",
    "data_aposta": "2026-02-24",
    "data_emissao": "2026-02-24 08:57:54",
    "referencia_unica": "055-07189292-166",
    "valor_total": 1.00,
    "valido": true,
    "apostas": [
      {
        "indice": 1,
        "numeros": ["35", "37", "40", "44", "46"],
        "numero_da_sorte": "04"
      }
    ]
  }]
}

**M1lhão:**
{
  "jogos": [{
    "tipo": "M1lhão",
    "data_sorteio": "2026-02-27",
    "data_aposta": "2026-02-24",
    "data_emissao": "2026-02-24 08:57:56",
    "referencia_unica": "555-03672294-237",
    "valor_total": 0.30,
    "valido": true,
    "apostas": [
      {
        "indice": 1,
        "codigo": "GTP11668"
      }
    ]
  }]
}

------------------------------------------------------------------
EXEMPLOS DE APOSTAS MÚLTIPLAS:
------------------------------------------------------------------

**Euromilhões com 2 apostas:**
{
  "jogos": [{
    "tipo": "Euromilhões",
    "data_sorteio": "2025-08-15",
    "data_aposta": "2025-08-14",
    "data_emissao": "2025-08-14 14:53:32",
    "referencia_unica": "726-01986439-171",
    "valor_total": 4.40,
    "valido": true,
    "apostas": [
      {
        "indice": 1,
        "numeros": ["01", "14", "20", "21", "32"],
        "estrelas": ["05", "07"]
      },
      {
        "indice": 2,
        "numeros": ["02", "12", "22", "23", "34"],
        "estrelas": ["01", "10"]
      }
    ]
  }]
}

------------------------------------------------------------------
VALIDAÇÃO FINAL
------------------------------------------------------------------
✓ Todos os números têm 2 dígitos? (01, não 1)
✓ O formato corresponde ao padrão do jogo?
✓ As datas estão no formato correto?
✓ A referencia_unica foi extraída do rodapé?
✓ O valor_total é um número decimal?
"""

# ---------------------------------------------------------
# FUNÇÕES DE APOIO
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
    """Normaliza o nome para o ficheiro: Euromilhões -> euromilhoes"""
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
    
    # Carregar ou criar histórico
    if os.path.exists(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            historico = json.load(f)
    else:
        historico = []

    # Verificar duplicados (pela Referência Única da Santa Casa)
    ref = jogo.get("referencia_unica")
    if ref and any(item.get("referencia_unica") == ref for item in historico):
        print(f"  ⚠️ Referência {ref} já registada em {nome_ficheiro}.")
        return False

    # Enriquecer dados
    jogo["imagem_origem"] = img_nome
    jogo["hash_imagem"] = img_hash
    jogo["data_processamento"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    historico.append(jogo)

    # Gravação atómica por jogo
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(historico, f, indent=4, ensure_ascii=False)
    
    print(f"  ✅ Guardado em {nome_ficheiro} com {len(historico)} registos")
    return True

# ---------------------------------------------------------
# MOTOR DE PROCESSAMENTO
# ---------------------------------------------------------

def processar():
    os.makedirs(PASTA_DADOS, exist_ok=True)
    os.makedirs(PASTA_UPLOADS, exist_ok=True)

    registo = carregar_registo()
    imagens = [f for f in os.listdir(PASTA_UPLOADS) if f.lower().endswith((".jpg", ".jpeg", ".png"))]

    if not imagens:
        print("📭 Nenhuma imagem nova para processar.")
        return

    for img_nome in imagens:
        caminho = os.path.join(PASTA_UPLOADS, img_nome)
        img_hash = gerar_hash(caminho)

        if img_hash in registo:
            print(f"⏩ Imagem já processada: {img_nome}")
            continue

        print(f"\n🚀 A processar: {img_nome}")

        try:
            img = PIL.Image.open(caminho)
            
            resposta = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[INSTRUCAO, img],
                config={
                    "temperature": 0,
                    "response_mime_type": "application/json"
                }
            )
            
            # O Flash devolve o JSON direto se configurado no config
            dados = json.loads(resposta.text)
            
            # Debug: mostra o JSON recebido
            print(f"  📄 JSON recebido: {json.dumps(dados, indent=2)[:500]}...")

            jogos_processados = 0
            for jogo in dados.get("jogos", []):
                if guardar_jogo(jogo, img_nome, img_hash):
                    jogos_processados += 1

            if jogos_processados > 0:
                print(f"  ✅ {jogos_processados} jogo(s) processado(s) com sucesso")
                
                # Marcar como processado
                registo[img_hash] = {
                    "arquivo": img_nome,
                    "data": datetime.now().isoformat(),
                    "jogos": jogos_processados
                }
            else:
                print(f"  ⚠️ Nenhum jogo válido encontrado")

        except json.JSONDecodeError as e:
            print(f"  ❌ Erro ao decodificar JSON: {e}")
            print(f"  Resposta bruta: {resposta.text[:500]}")
        except Exception as e:
            print(f"  ❌ Erro: {e}")

    guardar_registo(registo)
    print("\n🏁 Processamento concluído.")

if __name__ == "__main__":
    processar()
