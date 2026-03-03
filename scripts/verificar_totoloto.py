import json
import os
import glob
import re
from datetime import datetime
from typing import Dict, List, Tuple

# ===== CONFIGURAÇÃO =====
FICHEIRO_APOSTAS = "apostas/totoloto.json"
PASTA_DADOS = "dados/"
FICHEIRO_SORTEIOS_PADRAO = "totoloto_sc_*.json"
FICHEIRO_RESULTADOS = "resultados/totoloto_verificacoes.json"

# ===== TABELA DE PRÉMIOS =====
PREMIOS_NUMEROS_TOTOLOTO = {
    5: "2.º Prémio",  
    4: "3.º Prémio",  
    3: "4.º Prémio",  
    2: "5.º Prémio",  
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

def carregar_todos_sorteios() -> dict:
    todos_sorteios = {}
    ficheiros = glob.glob(os.path.join(PASTA_DADOS, FICHEIRO_SORTEIOS_PADRAO))
    
    for ficheiro in ficheiros:
        nome = os.path.basename(ficheiro)
        if nome == "totoloto_sc_atual.json":
            continue
        match = re.search(r'totoloto_sc_(\d{4})\.json', nome)
        if not match:
            continue
        ano = match.group(1)
        try:
            with open(ficheiro, "r", encoding="utf-8") as f:
                dados = json.load(f)
            if ano in dados and isinstance(dados[ano], list):
                lista_sorteios = dados[ano]
            elif isinstance(dados, list):
                lista_sorteios = dados
            else:
                continue
            index = {}
            for s in lista_sorteios:
                chave = f"{s.get('data')}|{s.get('concurso')}"
                index[chave] = s
            todos_sorteios[ano] = {"lista": lista_sorteios, "index": index}
        except:
            continue
    return todos_sorteios

def normalizar_data_para_busca(data_aposta: str) -> str:
    try:
        ano, mes, dia = data_aposta.split('-')
        return f"{dia}/{mes}/{ano}"
    except:
        return data_aposta

def extrair_numeros_sorteio(sorteio: dict) -> Tuple[List[str], str]:
    numeros = [str(n).zfill(2) for n in sorteio.get("numeros", [])]
    especial = str(sorteio.get("especial", "")).zfill(2)
    return numeros, especial

def calcular_acertos(aposta_numeros: List[str], aposta_especial: str,
                     sorteio_numeros: List[str], sorteio_especial: str) -> Tuple[int, bool]:
    acertos_numeros = len(set(aposta_numeros) & set(sorteio_numeros))
    acertou_especial = aposta_especial == sorteio_especial
    return acertos_numeros, acertou_especial

def encontrar_premios(sorteio: dict, acertos_n: int, acertou_especial: bool) -> List[dict]:
    premios_ganhos = []
    if acertou_especial:
        for premio in sorteio.get("premios", []):
            if premio.get("premio") == "Nº da Sorte":
                premios_ganhos.append(premio)
                break
    if acertos_n >= 2:
        nome_premio = PREMIOS_NUMEROS_TOTOLOTO.get(acertos_n)
        if nome_premio:
            for premio in sorteio.get("premios", []):
                if premio.get("premio") == nome_premio:
                    premios_ganhos.append(premio)
                    break
    if acertos_n == 5 and acertou_especial:
        for premio in sorteio.get("premios", []):
            if premio.get("premio") == "1.º Prémio":
                premios_ganhos = [p for p in premios_ganhos if p.get("premio") != "2.º Prémio"]
                premios_ganhos.append(premio)
                break
    return premios_ganhos

def calcular_valor_total(premios: List[dict]) -> str:
    total = 0.0
    for p in premios:
        valor_str = p.get("valor", "0")
        valor_limpo = valor_str.replace("€ ", "").replace(".", "").replace(",", ".")
        try:
            if "Reembolso" in valor_str:
                total += 1.0
            else:
                total += float(valor_limpo)
        except:
            pass
    if total == 0:
        return "€ 0,00"
    elif total == 1.0 and any("Reembolso" in p.get("valor", "") for p in premios):
        return "€ 1,00 (Reembolso)"
    else:
        return f"€ {total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

# ============================================================
# VERIFICAÇÃO
# ============================================================

def verificar_boletins(apostas: list, todos_sorteios: dict) -> list:
    resultados = []
    for aposta in apostas:
        data_aposta = aposta.get("data_sorteio")
        concurso_aposta = aposta.get("concurso")
        try:
            ano_aposta = data_aposta.split('-')[0]
        except:
            continue
        dados_ano = todos_sorteios.get(ano_aposta)
        if not dados_ano:
            continue
        data_sorteio_formatada = normalizar_data_para_busca(data_aposta)
        sorteio_encontrado = None
        metodo_encontrado = ""
        if concurso_aposta:
            chave_exata = f"{data_sorteio_formatada}|{concurso_aposta}"
            sorteio_encontrado = dados_ano["index"].get(chave_exata)
            if sorteio_encontrado:
                metodo_encontrado = "data + concurso"
        if not sorteio_encontrado:
            for s in dados_ano["lista"]:
                if s.get("data") == data_sorteio_formatada:
                    sorteio_encontrado = s
                    metodo_encontrado = "apenas data"
                    break
        if not sorteio_encontrado:
            continue
        numeros_sorteio, especial_sorteio = extrair_numeros_sorteio(sorteio_encontrado)
        for aposta_ind in aposta.get("apostas", []):
            numeros_aposta = aposta_ind.get("numeros", [])
            especial_aposta = aposta_ind.get("numero_da_sorte", "")
            acertos_n, acertou_especial = calcular_acertos(
                numeros_aposta, especial_aposta,
                numeros_sorteio, especial_sorteio
            )
            premios_ganhos = encontrar_premios(sorteio_encontrado, acertos_n, acertou_especial)
            resultado = {
                "data_verificacao": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "metodo_validacao": metodo_encontrado,
                "boletim": {
                    "referencia": aposta.get("referencia_unica"),
                    "data_sorteio": aposta.get("data_sorteio"),
                    "concurso_sorteio": concurso_aposta,
                    "imagem_origem": aposta.get("imagem_origem")
                },
                "aposta": {
                    "indice": aposta_ind.get("indice", 1),
                    "numeros": numeros_aposta,
                    "numero_da_sorte": especial_aposta
                },
                "sorteio": {
                    "concurso": sorteio_encontrado.get("concurso"),
                    "data": sorteio_encontrado.get("data"),
                    "numeros": numeros_sorteio,
                    "numero_da_sorte": especial_sorteio
                },
                "acertos": {
                    "numeros": acertos_n,
                    "numero_da_sorte": acertou_especial,
                    "descricao": f"{acertos_n} número(s) {'com' if acertou_especial else 'sem'} Nº da Sorte"
                }
            }
            if premios_ganhos:
                resultado["ganhou"] = True
                resultado["premios"] = premios_ganhos
                resultado["valor_total"] = calcular_valor_total(premios_ganhos)
                if len(premios_ganhos) == 1:
                    resultado["premio"] = premios_ganhos[0]
                else:
                    categorias = [p.get("premio") for p in premios_ganhos]
                    resultado["premio"] = {
                        "categoria": " + ".join(categorias),
                        "descricao": "Acumulação de prémios",
                        "valor": resultado["valor_total"]
                    }
            else:
                resultado["ganhou"] = False
                resultado["premios"] = []
                resultado["premio"] = {"categoria": "Sem prémio", "descricao": "0 acertos", "valor": "€ 0,00"}
            resultados.append(resultado)
            # Mostrar no terminal
            mostrar_resultado_simples(resultado, metodo_encontrado)
    return resultados

def mostrar_resultado_simples(resultado: dict, metodo: str):
    print("\n" + "="*70)
    print(f"📅 Sorteio: {resultado['sorteio']['concurso']} - {resultado['sorteio']['data']}")
    print(f"🎫 Boletim: {resultado['boletim']['referencia']} (índice {resultado['aposta']['indice']})")
    print(f"   Validação por: {metodo.upper()}")
    print(f"   Aposta:   {' '.join(resultado['aposta']['numeros'])} + {resultado['aposta']['numero_da_sorte']}")
    print(f"   Sorteio:  {' '.join(resultado['sorteio']['numeros'])} + {resultado['sorteio']['numero_da_sorte']}")
    print(f"   Acertos:  {resultado['acertos']['numeros']} números", end="")
    if resultado['acertos']['numero_da_sorte']:
        print(f" + Nº da Sorte ✅")
    else:
        print(f"")
    if resultado.get('ganhou'):
        if len(resultado.get('premios', [])) > 1:
            print(f"   🏆 ACUMULAÇÃO DE PRÉMIOS:")
            for p in resultado['premios']:
                print(f"      • {p['premio']}: {p['valor']}")
            print(f"   💰 TOTAL: {resultado['valor_total']}")
        else:
            p = resultado['premios'][0]
            print(f"   🏆 GANHOU: {p.get('premio')}")
            print(f"   💰 Prémio: {p.get('valor')}")
    else:
        print(f"   ❌ Nenhum prémio")
    print("="*70)

def guardar_resultados(resultados: list):
    os.makedirs("resultados", exist_ok=True)
    if os.path.exists(FICHEIRO_RESULTADOS):
        with open(FICHEIRO_RESULTADOS, "r", encoding="utf-8") as f:
            historico = json.load(f)
    else:
        historico = []
    novos_adicionados = 0
    for novo in resultados:
        chave_nova = (
            novo["boletim"]["referencia"],
            novo["aposta"]["indice"],
            novo["boletim"]["concurso_sorteio"]
        )
        if not any(
            e["boletim"]["referencia"] == chave_nova[0] and
            e["aposta"]["indice"] == chave_nova[1] and
            e["boletim"]["concurso_sorteio"] == chave_nova[2] for e in historico
        ):
            historico.append(novo)
            novos_adicionados += 1
    with open(FICHEIRO_RESULTADOS, "w", encoding="utf-8") as f:
        json.dump(historico, f, indent=2, ensure_ascii=False)
    print(f"\n📁 Histórico guardado ({novos_adicionados} novos)")

def gerar_relatorio(resultados: list):
    if not resultados:
        return
    total = len(resultados)
    ganhadores = sum(1 for r in resultados if r.get('ganhou'))
    print("\n📊 RELATÓRIO FINAL - TOTOLOTO")
    print(f"Total de apostas verificadas: {total}")
    print(f"Apostas premiadas: {ganhadores}")
    print(f"Apostas sem prémio: {total - ganhadores}")

def main():
    print("\n🔍 VERIFICADOR DE BOLETINS TOTOLOTO")
    apostas = carregar_json(FICHEIRO_APOSTAS)
    if not apostas:
        print("❌ Nenhuma aposta encontrada")
        return
    todos_sorteios = carregar_todos_sorteios()
    if not todos_sorteios:
        print("❌ Nenhum sorteio encontrado")
        return
    resultados = verificar_boletins(apostas, todos_sorteios)
    if resultados:
        guardar_resultados(resultados)
        gerar_relatorio(resultados)
    else:
        print("\n❌ Nenhum resultado para verificar")

if __name__ == "__main__":
    main()
