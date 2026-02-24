from google import genai  # Novo SDK oficial
import PIL.Image
import os
import json
import hashlib
from datetime import datetime

# 1. Configuração do Cliente
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

PASTA_UPLOADS = "uploads/"
PASTA_DADOS = "apostas/"
FICHEIRO_REGISTO = "apostas/registo_processamento.json"

# 2. PROMPT MESTRE (O teu original preservado)
INSTRUCAO = """
Tu és um sistema de auditoria e extração estruturada de boletins oficiais da Santa Casa da Misericórdia de Lisboa (Portugal).

OBJETIVO:
1. Ler a imagem.
2. Identificar quais jogos têm aposta efetiva.
3. Interpretar o layout visual corretamente.
4. Validar segundo regras oficiais.
5. Produzir APENAS JSON válido.

Nunca devolver texto fora do JSON.
Nunca inventar dados.
Se um campo não existir ou estiver ilegível → usar null.

------------------------------------------------------------------
REGRAS GERAIS
------------------------------------------------------------------

- Só criar objeto de jogo se existir aposta real desse jogo.
- A mera presença do nome do jogo não significa que exista aposta.
- Não misturar jogos diferentes no mesmo objeto.
- Se valores estiverem fora do intervalo permitido → marcar "valido": false.
- Não corrigir números automaticamente.

------------------------------------------------------------------
INTERPRETAÇÃO POR JOGO (LAYOUT FIXO)
------------------------------------------------------------------

==============================
EUROMILHÕES
==============================

Layout típico:

Título: "EUROMILHÕES"

Linha superior contém:
- Tipo de aposta (ex: AP SIMPLES)
- Texto "SORT" seguido do número do sorteio
- Data do sorteio no lado direito

Aposta aparece em duas linhas:

Linha iniciada por "N" ou "1.N"
→ Contém exatamente 5 números principais (1–50)

Linha iniciada por "E"
→ Contém exatamente 2 estrelas (1–12)

Nunca misturar números da linha "N" com a linha "E".

Se não houver 5 números e 2 estrelas → valido = false

==============================
TOTOLOTO
==============================

Layout típico:

Linha principal contém 6 números (1–49).
Linha separada indica "Nº Sorte" com 1 número (1–13).

Não confundir Nº Sorte com número principal.

==============================
EURODREAMS
==============================

Contém:
- 6 números principais (1–40)
- 1 número "Dream" (1–5)

O número Dream aparece identificado como "Dream".

==============================
MILHÃO
==============================

Só criar objeto Milhão se existir código visível.

Código formato:
- 3 letras + 5 números
- Pode aparecer como ABC12345 ou ABC 12345

Se não existir código → não criar objeto.

------------------------------------------------------------------
DATAS
------------------------------------------------------------------

Extrair separadamente:

- data_sorteio (data associada ao concurso)
- data_aposta (data impressa no talão)
- data_emissao (data + hora)

Converter formatos para:
- YYYY-MM-DD
- YYYY-MM-DD HH:MM:SS

------------------------------------------------------------------
ESTRUTURA JSON BASE
------------------------------------------------------------------

{
  "jogos": [
    {
      "tipo": "",
      "data_sorteio": null,
      "data_aposta": null,
      "data_emissao": null,
      "numero_sorteio": null,
      "referencia_unica": null,
      "valor_total": null,
      "mediador": null,
      "tipo_aposta": null,
      "valido": true,
      "apostas": []
    }
  ]
}

------------------------------------------------------------------
ESTRUTURA ESPECÍFICA POR JOGO
------------------------------------------------------------------

EUROMILHÕES
"apostas": [
  {
    "coluna": 1,
    "numeros": [5 números],
    "estrelas": [2 números]
  }
]

TOTOLOTO
"apostas": [
  {
    "coluna": 1,
    "numeros": [6 números],
    "numero_da_sorte": número
  }
]

EURODREAMS
"apostas": [
  {
    "coluna": 1,
    "numeros": [6 números],
    "numero_dream": número
  }
]

MILHÃO
"apostas": [
  {
    "codigo": "ABC12345"
  }
]

Nunca incluir campos que não pertençam ao jogo.

------------------------------------------------------------------
REGRAS FINAIS
------------------------------------------------------------------

- Nunca inventar dados.
- Nunca devolver texto fora do JSON.
- Se o boletim contiver múltiplos jogos, criar múltiplos objetos dentro de "jogos".
- Nunca misturar jogos diferentes no mesmo objeto.
- Se um valor não existir ou estiver ilegível, usar null.
- Se um valor violar regras oficiais, marcar "valido": false.
"""

# ---------------------------------------------------------
# Funções auxiliares (Preservadas conforme solicitado)
# ---------------------------------------------------------

def gerar_hash(caminho):
    h = hashlib.md5()
    with open(caminho, "rb") as f:
        h.update(f.read())
    return h.hexdigest()

def carregar_registo():
    if os.path.exists(FICHEIRO_REGISTO):
        with open(FICHEIRO_REGISTO, "r") as f:
            return json.load(f)
    return {}

def guardar_registo(reg):
    with open(FICHEIRO_REGISTO, "w") as f:
        json.dump(reg, f, indent=4)

def limpar_json(texto):
    return texto.replace("```json", "").replace("```", "").strip()

def caminho_json_jogo(nome):
    nome = nome.lower().replace(" ", "_")
    return os.path.join(PASTA_DADOS, f"{nome}.json")

def guardar_jogo(jogo, img_nome, img_hash):
    if not jogo.get("tipo"): return False
    caminho = caminho_json_jogo(jogo["tipo"])

    if os.path.exists(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            historico = json.load(f)
    else:
        historico = []

    ref = jogo.get("referencia_unica")
    if ref and any(item.get("referencia_unica") == ref for item in historico):
        print(f"⚠️ Bilhete {ref} já registado.")
        return False

    jogo["imagem_origem"] = img_nome
    jogo["hash_imagem"] = img_hash
    jogo["data_processamento"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    historico.append(jogo)

    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(historico, f, indent=4, ensure_ascii=False)

    return True

# ---------------------------------------------------------
# PROCESSAMENTO PRINCIPAL
# ---------------------------------------------------------

if __name__ == "__main__":
    os.makedirs(PASTA_DADOS, exist_ok=True)
    os.makedirs(PASTA_UPLOADS, exist_ok=True)

    registo = carregar_registo()
    imagens = [f for f in os.listdir(PASTA_UPLOADS) if f.lower().endswith((".jpg", ".jpeg", ".png"))]

    for img_nome in imagens:
        caminho = os.path.join(PASTA_UPLOADS, img_nome)
        img_hash = gerar_hash(caminho)

        if img_hash in registo:
            continue

        print(f"\n📄 Processando: {img_nome}")

        try:
            img = PIL.Image.open(caminho)
            
            # Ajustado para gemini-2.5-flash conforme a tua quota disponível
            resposta = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[INSTRUCAO, img]
            )
            
            texto = limpar_json(resposta.text)
            dados = json.loads(texto)

            for jogo in dados.get("jogos", []):
                if guardar_jogo(jogo, img_nome, img_hash):
                    print(f"✅ {jogo['tipo']} registado com sucesso.")

            registo[img_hash] = {
                "arquivo": img_nome,
                "data": datetime.now().isoformat()
            }

        except Exception as e:
            print(f"❌ Erro: {e}")

    guardar_registo(registo)
