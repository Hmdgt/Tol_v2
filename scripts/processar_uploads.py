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

# 2. PROMPT MESTRE (VERSÃO SUPER PRO - EXTRAÇÃO VERTICAL & ESPECÍFICA)
INSTRUCAO = """
Tu és um sistema de auditoria e extração estruturada de boletins oficiais da Santa Casa da Misericórdia de Lisboa (Portugal).

OBJETIVO:
1. Identificar o jogo pelo logótipo.
2. Interpretar o layout vertical (âncoras 1., 2., 3.).
3. Gerar JSON específico para cada jogo, sem campos desnecessários.

------------------------------------------------------------------
REGRAS DE EXTRAÇÃO VERTICAL (ÂNCORAS)
------------------------------------------------------------------
- Cada aposta individual é marcada por um número e ponto (ex: 1., 2.).
- Tudo o que estiver abaixo de "1." e antes de "2." pertence à primeira aposta.
- Exemplo Euromilhões: "1.N" (números) e na linha abaixo "E" (estrelas) = MESMA APOSTA.

------------------------------------------------------------------
ESPECIFICAÇÕES POR JOGO (ESQUEMAS ÚNICOS)
------------------------------------------------------------------
EUROMILHÕES:
- Campos: "coluna", "numeros" (5), "estrelas" (2).
- Ignorar seção publicitária do M1lhão.

TOTOLOTO:
- Campos: "coluna", "numeros" (6), "numero_da_sorte" (1).

EURODREAMS:
- Campos: "coluna", "numeros" (6), "numero_dream" (1).

M1LHÃO (Boletim Próprio):
- Campo: "codigo" (3 letras + 5 números).
- Não tem números, estrelas ou colunas.

------------------------------------------------------------------
ESTRUTURA JSON OBRIGATÓRIA
------------------------------------------------------------------
{
  "jogos": [
    {
      "tipo": "NOME_DO_JOGO",
      "data_sorteio": "YYYY-MM-DD",
      "data_aposta": "YYYY-MM-DD",
      "data_emissao": "YYYY-MM-DD HH:MM:SS",
      "numero_sorteio": null,
      "referencia_unica": "ID_RODAPE",
      "valor_total": null,
      "valido": true,
      "apostas": []
    }
  ]
}
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
    return nome.lower().strip().replace(" ", "_").replace("õ", "o").replace("ã", "a").replace("ê", "e").replace("í", "i")

def guardar_jogo(jogo, img_nome, img_hash):
    if not jogo.get("tipo"): return False
    
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

            for jogo in dados.get("jogos", []):
                if guardar_jogo(jogo, img_nome, img_hash):
                    print(f"  ✅ {jogo['tipo']} -> {limpar_nome_jogo(jogo['tipo'])}.json")

            # Marcar como processado
            registo[img_hash] = {
                "arquivo": img_nome,
                "data": datetime.now().isoformat()
            }

        except Exception as e:
            print(f"  ❌ Erro: {e}")

    guardar_registo(registo)
    print("\n🏁 Processamento concluído.")

if __name__ == "__main__":
    processar()
