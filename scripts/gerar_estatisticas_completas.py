#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import glob
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Any

# ===== CONFIGURAÇÃO =====
PASTA_RESULTADOS = "resultados/"
FICHEIRO_ESTATISTICAS = os.path.join(PASTA_RESULTADOS, "estatisticas_completas.json")

# ===== FUNÇÕES AUXILIARES =====
def extrair_valor_monetario(valor_str: str) -> float:
    """Converte string como '€ 1,80' ou '€ 10,50' para float."""
    if not valor_str:
        return 0.0
    # Remove '€ ' e espaços, troca vírgula por ponto
    valor_limpo = valor_str.replace('€', '').replace(' ', '').replace(',', '.')
    # Caso especial "Reembolso" – considerar 1€
    if 'Reembolso' in valor_limpo:
        return 1.0
    try:
        return float(valor_limpo)
    except ValueError:
        return 0.0

def carregar_resultados_jogo(jogo: str) -> List[Dict]:
    """Carrega o ficheiro de verificacoes de um jogo específico."""
    caminho = os.path.join(PASTA_RESULTADOS, f"{jogo}_verificacoes.json")
    if not os.path.exists(caminho):
        return []
    with open(caminho, "r", encoding="utf-8") as f:
        return json.load(f)

def calcular_mediana(valores: List[float]) -> float:
    """Calcula a mediana de uma lista de números."""
    if not valores:
        return 0.0
    sorted_vals = sorted(valores)
    n = len(sorted_vals)
    mid = n // 2
    if n % 2 == 0:
        return (sorted_vals[mid-1] + sorted_vals[mid]) / 2
    else:
        return sorted_vals[mid]

# ===== PROCESSAMENTO POR JOGO =====
def processar_jogo(jogo: str) -> Dict[str, Any]:
    """
    Lê o histórico de verificações de um jogo e retorna estatísticas mensais e anuais.
    """
    resultados = carregar_resultados_jogo(jogo)
    if not resultados:
        return {}

    # Dicionário para acumular estatísticas mensais
    stats_mensais = defaultdict(lambda: {
        "total_apostas": 0,
        "total_gasto": 0.0,
        "total_recebido": 0.0,
        "ganhadoras": 0,
        "acertos_numeros": 0,
        "acertos_especial": 0,
        "valores_premios": [],      # lista de valores para cálculo de médias/medianas
        "maior_premio": 0.0,
        "data_maior_premio": None,
        # Para controlo interno
        "_boletins_processados": set()  # evita contar o gasto múltiplas vezes por aposta
    })

    for res in resultados:
        # Obter data no formato ISO (YYYY-MM-DD)
        data = res.get("boletim", {}).get("data_sorteio")
        if not data:
            continue
        ano_mes = data[:7]  # YYYY-MM
        mes = stats_mensais[ano_mes]

        # Cada 'res' corresponde a UMA aposta individual (índice)
        mes["total_apostas"] += 1

        # --- Gasto (rateado do boletim) ---
        # O boletim pode ter várias apostas; o custo por aposta = valor_total / n_apostas
        # Para não recalcular por aposta, podemos usar um identificador único do boletim
        boletim_id = res.get("boletim", {}).get("referencia")
        if boletim_id and boletim_id not in mes["_boletins_processados"]:
            # Ainda não contabilizámos o custo deste boletim
            # Precisamos do valor_total. Vamos buscá-lo aos detalhes? 
            # Nos resultados de verificação, o campo 'valor_total' está ao nível do boletim?
            # Na estrutura atual, 'detalhes' (que é o resultado original) tem o boletim com valor_total.
            # Mas temos de aceder a res diretamente? 
            # NOTA: o ficheiro de verificações contém o resultado tal como saiu do verificador,
            # que inclui o objeto boletim com 'valor_total'. Vamos assumir que está em res['boletim'].
            valor_total_boletim = float(res.get("boletim", {}).get("valor_total", 0))
            # Número de apostas no boletim: podemos obter do campo 'apostas' nos detalhes,
            # mas não está diretamente em res. Em vez disso, podemos contar as entradas com a mesma referência.
            # Como já estamos a iterar por aposta, podemos usar um dicionário auxiliar.
            # Simplificação: assumimos que o verificador já guardou o valor_total no boletim
            # e que cada aposta tem o mesmo custo. Vamos calcular o número de apostas deste boletim
            # contando quantas entradas no ficheiro têm a mesma referência.
            # Para não complicar, faremos um pré-processamento: agrupar por referência.
            # Mas para já, vou deixar um TODO e usar um valor fixo? Não, vamos fazer bem.
            pass

        # Solução mais robusta: pré-agrupar por referência antes de acumular.
        # Vou refazer a lógica: primeiro, agrupar todas as apostas por referência de boletim.
        # Mas para manter o código simples e eficaz, vou optar por uma abordagem
        # que usa um dicionário auxiliar por mês para controlar os boletins já processados.

    # Como a implementação acima está incompleta, vou reescrever de forma mais clara:

def processar_jogo(jogo: str) -> Dict[str, Any]:
    resultados = carregar_resultados_jogo(jogo)
    if not resultados:
        return {}

    # Agrupar apostas por referência de boletim para ratear corretamente o gasto
    boletins_por_ref = defaultdict(list)
    for res in resultados:
        ref = res.get("boletim", {}).get("referencia")
        if ref:
            boletins_por_ref[ref].append(res)

    stats_mensais = defaultdict(lambda: {
        "total_apostas": 0,
        "total_gasto": 0.0,
        "total_recebido": 0.0,
        "ganhadoras": 0,
        "acertos_numeros": 0,
        "acertos_especial": 0,
        "valores_premios": [],
        "maior_premio": 0.0,
        "data_maior_premio": None
    })

    for ref, apostas in boletins_por_ref.items():
        # Todas as apostas pertencem ao mesmo boletim
        # Obter valor_total da primeira (todas têm o mesmo)
        valor_total_boletim = 0.0
        data_exemplo = None
        if apostas:
            primeiro = apostas[0]
            data_exemplo = primeiro.get("boletim", {}).get("data_sorteio")
            valor_total_boletim = float(primeiro.get("boletim", {}).get("valor_total", 0))
        n_apostas = len(apostas)
        if n_apostas == 0:
            continue
        custo_por_aposta = valor_total_boletim / n_apostas if n_apostas > 0 else 0

        for res in apostas:
            data = res.get("boletim", {}).get("data_sorteio")
            if not data:
                continue
            ano_mes = data[:7]
            mes = stats_mensais[ano_mes]

            mes["total_apostas"] += 1
            mes["total_gasto"] += custo_por_aposta

            # Acertos
            acertos = res.get("acertos", {})
            mes["acertos_numeros"] += acertos.get("numeros", 0)
            # 'especial' pode ser número de estrelas, dream, etc.
            mes["acertos_especial"] += acertos.get("estrelas", 0) or acertos.get("dream_number", 0) or acertos.get("numero_da_sorte", 0)

            # Prémios
            premios = res.get("premios", [])
            total_recebido_aposta = 0.0
            for p in premios:
                valor = extrair_valor_monetario(p.get("valor", "0"))
                total_recebido_aposta += valor
                mes["valores_premios"].append(valor)

            if total_recebido_aposta > 0:
                mes["ganhadoras"] += 1
                mes["total_recebido"] += total_recebido_aposta

                if total_recebido_aposta > mes["maior_premio"]:
                    mes["maior_premio"] = total_recebido_aposta
                    mes["data_maior_premio"] = data

    # Calcular derivados mensais
    for mes, dados in stats_mensais.items():
        dados["saldo"] = round(dados["total_recebido"] - dados["total_gasto"], 2)
        dados["percentagem_ganhadoras"] = round(
            (dados["ganhadoras"] / dados["total_apostas"] * 100) if dados["total_apostas"] > 0 else 0, 2
        )
        # Média dos prémios (apenas entre apostas que ganharam)
        if dados["ganhadoras"] > 0:
            dados["media_premios"] = round(dados["total_recebido"] / dados["ganhadoras"], 2)
        else:
            dados["media_premios"] = 0.0
        # Mediana dos prémios (considerando todas as apostas? ou só ganhadoras?)
        # Vamos considerar apenas ganhadoras
        dados["mediana_premios"] = round(calcular_mediana(dados["valores_premios"]), 2)
        # Média de acertos
        if dados["total_apostas"] > 0:
            dados["media_acertos_numeros"] = round(dados["acertos_numeros"] / dados["total_apostas"], 2)
            dados["media_acertos_especial"] = round(dados["acertos_especial"] / dados["total_apostas"], 2)
        else:
            dados["media_acertos_numeros"] = 0.0
            dados["media_acertos_especial"] = 0.0
        # Arredondar valores monetários
        for k in ["total_gasto", "total_recebido", "maior_premio"]:
            dados[k] = round(dados[k], 2)
        # Remover campo auxiliar
        if "valores_premios" in dados:
            del dados["valores_premios"]

    return dict(stats_mensais)

def agregar_anual(mensais: Dict) -> Dict:
    """Agrupa estatísticas mensais por ano."""
    anuais = defaultdict(lambda: {
        "total_apostas": 0,
        "total_gasto": 0.0,
        "total_recebido": 0.0,
        "ganhadoras": 0,
        "acertos_numeros": 0,
        "acertos_especial": 0,
        "valores_premios": [],
        "maior_premio": 0.0,
        "data_maior_premio": None
    })

    for mes, dados in mensais.items():
        ano = mes[:4]
        acc = anuais[ano]
        acc["total_apostas"] += dados["total_apostas"]
        acc["total_gasto"] += dados["total_gasto"]
        acc["total_recebido"] += dados["total_recebido"]
        acc["ganhadoras"] += dados["ganhadoras"]
        acc["acertos_numeros"] += dados["acertos_numeros"]
        acc["acertos_especial"] += dados["acertos_especial"]
        # Para a mediana, precisamos de todos os valores de prémio do ano
        # Como não os guardámos, podemos recalcular a mediana a partir da média? Não é possível.
        # Vamos optar por não calcular mediana anual.
        if dados["maior_premio"] > acc["maior_premio"]:
            acc["maior_premio"] = dados["maior_premio"]
            acc["data_maior_premio"] = dados["data_maior_premio"]

    # Calcular derivados anuais
    for ano, dados in anuais.items():
        dados["saldo"] = round(dados["total_recebido"] - dados["total_gasto"], 2)
        dados["percentagem_ganhadoras"] = round(
            (dados["ganhadoras"] / dados["total_apostas"] * 100) if dados["total_apostas"] > 0 else 0, 2
        )
        if dados["ganhadoras"] > 0:
            dados["media_premios"] = round(dados["total_recebido"] / dados["ganhadoras"], 2)
        else:
            dados["media_premios"] = 0.0
        if dados["total_apostas"] > 0:
            dados["media_acertos_numeros"] = round(dados["acertos_numeros"] / dados["total_apostas"], 2)
            dados["media_acertos_especial"] = round(dados["acertos_especial"] / dados["total_apostas"], 2)
        else:
            dados["media_acertos_numeros"] = 0.0
            dados["media_acertos_especial"] = 0.0
        # Arredondar
        for k in ["total_gasto", "total_recebido", "maior_premio"]:
            dados[k] = round(dados[k], 2)

    return dict(anuais)

def calcular_globais(estatisticas_por_jogo: Dict) -> Dict:
    """Calcula estatísticas agregadas de todos os jogos."""
    global_mensal = defaultdict(lambda: {
        "total_apostas": 0,
        "total_gasto": 0.0,
        "total_recebido": 0.0,
        "ganhadoras": 0,
        "maior_premio": 0.0,
        "data_maior_premio": None
    })

    for jogo, dados_jogo in estatisticas_por_jogo.items():
        for mes, dados in dados_jogo.items():
            g = global_mensal[mes]
            g["total_apostas"] += dados["total_apostas"]
            g["total_gasto"] += dados["total_gasto"]
            g["total_recebido"] += dados["total_recebido"]
            g["ganhadoras"] += dados["ganhadoras"]
            if dados["maior_premio"] > g["maior_premio"]:
                g["maior_premio"] = dados["maior_premio"]
                g["data_maior_premio"] = dados["data_maior_premio"]

    global_anual = defaultdict(lambda: {
        "total_apostas": 0,
        "total_gasto": 0.0,
        "total_recebido": 0.0,
        "ganhadoras": 0,
        "maior_premio": 0.0,
        "data_maior_premio": None
    })

    for mes, dados in global_mensal.items():
        ano = mes[:4]
        g = global_anual[ano]
        g["total_apostas"] += dados["total_apostas"]
        g["total_gasto"] += dados["total_gasto"]
        g["total_recebido"] += dados["total_recebido"]
        g["ganhadoras"] += dados["ganhadoras"]
        if dados["maior_premio"] > g["maior_premio"]:
            g["maior_premio"] = dados["maior_premio"]
            g["data_maior_premio"] = dados["data_maior_premio"]

    # Calcular derivados
    for dados in list(global_mensal.values()) + list(global_anual.values()):
        dados["saldo"] = round(dados["total_recebido"] - dados["total_gasto"], 2)
        dados["percentagem_ganhadoras"] = round(
            (dados["ganhadoras"] / dados["total_apostas"] * 100) if dados["total_apostas"] > 0 else 0, 2
        )
        dados["total_gasto"] = round(dados["total_gasto"], 2)
        dados["total_recebido"] = round(dados["total_recebido"], 2)
        dados["maior_premio"] = round(dados["maior_premio"], 2)

    return {
        "mensal": dict(global_mensal),
        "anual": dict(global_anual)
    }

# ===== MAIN =====
def main():
    print("\n📊 GERADOR DE ESTATÍSTICAS COMPLETAS (BASEADO EM RESULTADOS VERIFICADOS)")
    print("="*70)

    jogos = ["totoloto", "euromilhoes", "eurodreams", "milhao"]

    estatisticas = {
        "mensal": {},
        "anual": {},
        "global": {},
        "ultima_atualizacao": datetime.now().isoformat()
    }

    for jogo in jogos:
        print(f"\n📌 Processando {jogo.upper()}...")
        mensais = processar_jogo(jogo)
        if mensais:
            estatisticas["mensal"][jogo] = mensais
            estatisticas["anual"][jogo] = agregar_anual(mensais)
            print(f"   ✅ Dados processados: {len(mensais)} meses")
        else:
            print(f"   ⚠️ Sem dados para {jogo}")

    # Calcular totais globais
    if estatisticas["mensal"]:
        estatisticas["global"] = calcular_globais(estatisticas["mensal"])
        print("\n🌍 Estatísticas globais calculadas.")

    # Guardar resultados
    os.makedirs(PASTA_RESULTADOS, exist_ok=True)
    with open(FICHEIRO_ESTATISTICAS, "w", encoding="utf-8") as f:
        json.dump(estatisticas, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Estatísticas guardadas em: {FICHEIRO_ESTATISTICAS}")

if __name__ == "__main__":
    main()
