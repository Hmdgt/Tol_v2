from google import genai  # Atualizado: Novo SDK
import PIL.Image
import os
import json
import hashlib
from datetime import datetime

# Configuração Gemini - Versão 2026
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

PASTA_UPLOADS = "uploads/"
PASTA_DADOS = "apostas/"
FICHEIRO_REGISTO = "apostas/registo_processamento.json"

# PROMPT MESTRE (Exatamente o teu original)
INSTRUCAO = """
Tu és um sistema de auditoria e extração estruturada de boletins oficiais da Santa Casa da Misericórdia de Lisboa (Portugal).

A tua função é:
1. Ler a imagem fornecida.
2. Identificar automaticamente quais dos seguintes jogos estão presentes:
    - Euromilhões
    - Totoloto
    - EuroDreams
    - Milhão
3. Extrair todos os dados relevantes.
4. Validar segundo regras oficiais.
5. Produzir APENAS JSON válido, sem texto adicional.

------------------------------------------------------------------
REGRAS OFICIAIS DOS JOGOS
------------------------------------------------------------------

EUROMILHÕES
- 5 números únicos entre 1 e 50
- 2 estrelas únicas entre 1 e 12

TOTOLOTO
- 6 números únicos entre 1 e 49
- Número da Sorte: 1 número entre 1 e 13

EURODREAMS
- 6 números únicos entre 1 e 40
- Dream: 1 número entre 1 e 5

MILHÃO
- Código alfanumérico único no formato:
  - ABC12345
  - ABC 12345
  - 3 letras + 5 dígitos

------------------------------------------------------------------
CAMPOS A EXTRAIR (SE EXISTIREM)
------------------------------------------------------------------

- tipo (nome do jogo)
- data_sorteio (YYYY-MM-DD)
- numero_sorteio
- data_aposta (YYYY-MM-DD)
- data_emissao (YYYY-MM-DD HH:MM:SS)
- referencia_unica
- mediador
- valor_total
- tipo_aposta ("Simples" ou "Multipla")
- apostas (estrutura depende do jogo)

------------------------------------------------------------------
VALIDAÇÃO
------------------------------------------------------------------

Cada jogo deve incluir:
- "valido": true → se todos os valores respeitam as regras oficiais
- "valido": false → se algum valor estiver fora do intervalo, ilegível, duplicado ou inválido

Não explicar erros.
Não comentar.
Não corrigir automaticamente valores ilegíveis.
Se não conseguires ler um campo, usa null.

------------------------------------------------------------------
ESTRUTURA OBRIGATÓRIA DE SAÍDA
------------------------------------------------------------------

Responder APENAS com JSON:

{
  "jogos": [
    {
      "tipo": "",
      "data_sorteio": null,
      "data_emissao": null,
      "data_aposta": null,
      "numero_sorteio": null,
      "referencia_unica": null,
      "valor_total": null,
      "mediador": null,
      "tipo_aposta": null,
      "valido": true,
      "apostas": [
        {
          "coluna": 1,
          "numeros": [],
          "estrelas": [],
          "numero_da_sorte": null,
          "numero_dream": null,
          "codigo": null
        }
      ]
    }
  ]
}

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
# Funções auxiliares (Originais)
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

    # Evitar duplicados pela referência única
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
# PROCESSAMENTO PRINCIPAL (Atualizado para o novo SDK)
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
            
            # Chamada usando o novo Client e modelo Flash 2.0
            resposta = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[INSTRUCAO, img]
            )
            
            texto = limpar_json(resposta.text)
            dados = json.loads(texto)

            # Processar cada jogo encontrado
            for jogo in dados.get("jogos", []):
                if guardar_jogo(jogo, img_nome, img_hash):
                    print(f"✅ {jogo['tipo']} registado com sucesso.")

            # Atualizar registo global
            registo[img_hash] = {
                "arquivo": img_nome,
                "data": datetime.now().isoformat()
            }

        except Exception as e:
            print(f"❌ Erro: {e}")

    guardar_registo(registo)
