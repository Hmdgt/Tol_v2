import json
import os
import glob
from datetime import datetime
from typing import List, Tuple

# ===== CONFIGURAÇÃO =====
FICHEIRO_APOSTAS = "apostas/eurodreams.json"
PASTA_DADOS = "dados/"
FICHEIRO_SORTEIOS_PADRAO = "eurodreams_*.json"
FICHEIRO_RESULTADOS = "resultados/eurodreams_verificacoes.json"

# ===== TABELA DE PRÉMIOS EURODREAMS =====
PREMIOS_EURODREAMS = {
    (6, True):  "1.º Prémio",
    (6, False): "2.º Prémio",
    (5, False): "3.º Prémio",
    (4, False): "4.º Prémio",
    (3, False): "5.º Prémio",
    (2, False): "6.º Prémio",
}

# ============================================================
# UTILITÁRIOS
# ============================================================

def carregar_json(ficheiro: str):
    if not os.path.exists(ficheiro):
        print(f"⚠️ Ficheiro não encontrado: {ficheiro}")
        return []
    with open(ficheiro, "r", encoding="utf-8") as f:
        return json.load(f)

def carregar_sorteios():
    todos = {}
    ficheiros = glob.glob(os.path.join(PASTA_DADOS, FICHEIRO_SORTEIOS_PADRAO))

    for ficheiro in ficheiros:
        try:
            with open(ficheiro, "r", encoding="utf-8") as f:
                dados = json.load(f)

            if isinstance(dados, list):
                lista = dados
            else:
                # Caso esteja estruturado por ano
                lista = []
                for ano in dados.values():
                    lista.extend(ano)

            index = {}
            for s in lista:
                chave = f"{s.get('data')}|{s.get('concurso')}"
                index[chave] = s

            todos.update(index)

        except Exception as e:
            print(f"Erro ao carregar {ficheiro}: {e}")

    return todos

def normalizar_data_para_busca(data_iso: str) -> str:
    try:
        ano, mes, dia = data_iso.split("-")
        return f"{dia}/{mes}/{ano}"
    except:
        return data_iso

def extrair_numeros_sorteio(sorteio: dict) -> Tuple[List[str], str]:
    numeros = [str(n).zfill(2) for n in sorteio.get("numeros", [])]
    dream = str(sorteio.get("dream", "")).zfill(1)
    return numeros, dream

def calcular_acertos(aposta_numeros, aposta_dream, sorteio_numeros, sorteio_dream):
    acertos = len(set(aposta_numeros) & set(sorteio_numeros))
    acertou_dream = aposta_dream == sorteio_dream
    return acertos, acertou_dream

# ============================================================
# LÓGICA DE PRÉMIOS (OFICIAL)
# ============================================================

def encontrar_premio(sorteio: dict, acertos_n: int, acertou_dream: bool):
    if acertos_n == 6:
        nome = "1.º Prémio" if acertou_dream else "2.º Prémio"
    else:
        nome = PREMIOS_EURODREAMS.get((acertos_n, False))

    if not nome:
        return None

    for p in sorteio.get("premios", []):
        if p.get("premio") == nome:
            return p

    return None

# ============================================================
# VERIFICAÇÃO
# ============================================================

def verificar_boletins(apostas, sorteios):
    resultados = []

    for boletim in apostas:
        data = boletim.get("data_sorteio")
        concurso = boletim.get("concurso")
        chave = f"{normalizar_data_para_busca(data)}|{concurso}"

        sorteio = sorteios.get(chave)
        if not sorteio:
            print(f"⚠️ Sorteio não encontrado: {data}")
            continue

        numeros_sorteio, dream_sorteio = extrair_numeros_sorteio(sorteio)

        for aposta in boletim.get("apostas", []):
            numeros_aposta = aposta.get("numeros", [])
            dream_aposta = aposta.get("dream", "")

            acertos_n, acertou_dream = calcular_acertos(
                numeros_aposta, dream_aposta,
                numeros_sorteio, dream_sorteio
            )

            premio = encontrar_premio(sorteio, acertos_n, acertou_dream)

            resultado = {
                "data_verificacao": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "boletim": {
                    "referencia": boletim.get("referencia_unica"),
                    "concurso_sorteio": concurso,
                    "data_sorteio": data
                },
                "aposta": {
                    "indice": aposta.get("indice"),
                    "numeros": numeros_aposta,
                    "dream": dream_aposta
                },
                "acertos": {
                    "numeros": acertos_n,
                    "dream": acertou_dream
                },
                "ganhou": bool(premio),
                "premio": premio if premio else {
                    "premio": "Sem prémio",
                    "valor": "€ 0,00"
                }
            }

            resultados.append(resultado)

            print(f"\n🎫 {boletim.get('referencia_unica')} | Índice {aposta.get('indice')}")
            print(f"   Acertos: {acertos_n} números {'+ Dream' if acertou_dream else ''}")
            if premio:
                print(f"   🏆 {premio.get('premio')} - {premio.get('valor')}")
            else:
                print("   ❌ Sem prémio")

    return resultados

# ============================================================
# GUARDAR RESULTADOS (SEM DUPLICAÇÃO)
# ============================================================

def guardar_resultados(resultados):
    os.makedirs("resultados", exist_ok=True)

    if os.path.exists(FICHEIRO_RESULTADOS):
        with open(FICHEIRO_RESULTADOS, "r", encoding="utf-8") as f:
            historico = json.load(f)
    else:
        historico = []

    novos = 0
    for novo in resultados:
        chave_nova = (
            novo["boletim"]["referencia"],
            novo["aposta"]["indice"],
            novo["boletim"]["concurso_sorteio"]
        )

        existe = False
        for existente in historico:
            chave_existente = (
                existente["boletim"]["referencia"],
                existente["aposta"]["indice"],
                existente["boletim"]["concurso_sorteio"]
            )
            if chave_nova == chave_existente:
                existe = True
                break

        if not existe:
            historico.append(novo)
            novos += 1

    with open(FICHEIRO_RESULTADOS, "w", encoding="utf-8") as f:
        json.dump(historico, f, indent=2, ensure_ascii=False)

    print(f"\n📁 Histórico atualizado ({novos} novos registos)")

# ============================================================
# RELATÓRIO
# ============================================================

def gerar_relatorio(resultados):
    total = len(resultados)
    ganhos = sum(1 for r in resultados if r["ganhou"])

    print("\n" + "="*60)
    print("📊 RELATÓRIO FINAL - EURODREAMS")
    print("="*60)
    print(f"Total apostas verificadas: {total}")
    print(f"Apostas premiadas: {ganhos}")
    print(f"Sem prémio: {total - ganhos}")

# ============================================================
# MAIN
# ============================================================

def main():
    print("\n🔍 VERIFICADOR EURODREAMS")
    print("="*60)

    apostas = carregar_json(FICHEIRO_APOSTAS)
    if not apostas:
        print("❌ Sem apostas")
        return

    sorteios = carregar_sorteios()
    if not sorteios:
        print("❌ Sem sorteios")
        return

    resultados = verificar_boletins(apostas, sorteios)

    if resultados:
        guardar_resultados(resultados)
        gerar_relatorio(resultados)
    else:
        print("❌ Nenhum resultado gerado")

if __name__ == "__main__":
    main()
