#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Any

# ===== CONFIGURAÇÃO =====
PASTA_RESULTADOS = "resultados/"
PASTA_DADOS = "dados/"
PASTA_APOSTAS = os.path.join(PASTA_DADOS, "apostas")
FICHEIRO_ESTATISTICAS = os.path.join(PASTA_RESULTADOS, "estatisticas_completas.json")

# ===== FUNÇÕES AUXILIARES =====
def extrair_valor_monetario(valor) -> float:
    """
    Converte um valor (string ou número) para float.
    Exemplos: "2,20" → 2.20, "7.15" → 7.15, 2.2 → 2.2, "Reembolso" → 1.0
    """
    if valor is None:
        return 0.0

    if isinstance(valor, (int, float)):
        return float(valor)

    try:
        valor_str = str(valor).strip()
        if not valor_str:
            return 0.0

        if 'Reembolso' in valor_str:
            return 1.0

        valor_limpo = valor_str.replace('€', '').replace(' ', '').replace(',', '.')
        return float(valor_limpo)
    except (ValueError, TypeError):
        return 0.0


def carregar_json(caminho: str):
    if not os.path.exists(caminho):
        return None
    with open(caminho, "r", encoding="utf-8") as f:
        return json.load(f)


def carregar_boletins(jogo: str) -> Dict[str, Any]:
    caminho = os.path.join(PASTA_APOSTAS, f"{jogo}.json")
    dados = carregar_json(caminho)
    boletins = {}

    if isinstance(dados, list):
        for b in dados:
            ref = b.get("referencia_unica")
            if ref:
                boletins[ref] = b
    return boletins


def carregar_sorteios(jogo: str) -> Dict[str, Any]:
    caminho = os.path.join(PASTA_DADOS, f"{jogo}_2026.json")
    dados = carregar_json(caminho)
    sorteios = {}

    if isinstance(dados, dict):
        for ano, lista in dados.items():
            for s in lista:
                concurso = s.get("concurso")
                if concurso:
                    sorteios[concurso] = s
    return sorteios


def carregar_verificacoes(jogo: str) -> List[Dict]:
    caminho = os.path.join(PASTA_RESULTADOS, f"{jogo}_verificacoes.json")
    dados = carregar_json(caminho)
    if not dados:
        return []

    for v in dados:
        if "premio" in v and v["premio"]:
            v["premios"] = [v["premio"]]
        elif "premios" not in v:
            v["premios"] = []
    return dados


def calcular_mediana(valores: List[float]) -> float:
    if not valores:
        return 0.0
    valores = sorted(valores)
    n = len(valores)
    mid = n // 2
    if n % 2 == 0:
        return (valores[mid - 1] + valores[mid]) / 2
    return valores[mid]


# ===== PROCESSAMENTO =====
def processar_jogo(jogo: str) -> Dict[str, Any]:
    verificacoes = carregar_verificacoes(jogo)
    boletins = carregar_boletins(jogo)
    sorteios = carregar_sorteios(jogo)

    if not verificacoes:
        return {}

    por_ref = defaultdict(list)
    for v in verificacoes:
        ref = v.get("boletim", {}).get("referencia")
        if ref:
            por_ref[ref].append(v)

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

    for ref, apostas in por_ref.items():
        boletim = boletins.get(ref, {})
        valor_total = extrair_valor_monetario(boletim.get("valor_total", 0))
        n_apostas = len(boletim.get("apostas", [])) or len(apostas)
        custo_por_aposta = valor_total / n_apostas if n_apostas else 0

        # 🔍 LOG ATIVADO – mostra o que está a acontecer
        print(f"   🔍 Ref: {ref} | Encontrado: {'SIM' if boletim else 'NÃO'} | valor_total: {valor_total} | n_apostas: {n_apostas} | custo_por_aposta: {custo_por_aposta}")

        for v in apostas:
            data = v.get("boletim", {}).get("data_sorteio")
            if not data:
                continue

            ano_mes = data[:7]
            mes = stats_mensais[ano_mes]

            mes["total_apostas"] += 1
            mes["total_gasto"] += custo_por_aposta

            ac = v.get("acertos", {})
            mes["acertos_numeros"] += ac.get("numeros", 0)
            mes["acertos_especial"] += ac.get("estrelas", 0)

            total_recebido = 0
            for p in v.get("premios", []):
                total_recebido += extrair_valor_monetario(p.get("valor", "0"))

            if total_recebido > 0:
                mes["ganhadoras"] += 1
                mes["total_recebido"] += total_recebido
                mes["valores_premios"].append(total_recebido)

                if total_recebido > mes["maior_premio"]:
                    mes["maior_premio"] = total_recebido
                    mes["data_maior_premio"] = data

    for mes, d in stats_mensais.items():
        d["saldo"] = round(d["total_recebido"] - d["total_gasto"], 2)
        d["percentagem_ganhadoras"] = round((d["ganhadoras"] / d["total_apostas"] * 100) if d["total_apostas"] else 0, 2)
        d["media_premios"] = round(d["total_recebido"] / d["ganhadoras"], 2) if d["ganhadoras"] else 0
        d["mediana_premios"] = round(calcular_mediana(d["valores_premios"]), 2)
        d["media_acertos_numeros"] = round(d["acertos_numeros"] / d["total_apostas"], 2)
        d["media_acertos_especial"] = round(d["acertos_especial"] / d["total_apostas"], 2)
        del d["valores_premios"]

    return dict(stats_mensais)


# ===== ANUAL E GLOBAL =====
def agregar_anual(mensais: Dict) -> Dict:
    anuais = defaultdict(lambda: {
        "total_apostas": 0,
        "total_gasto": 0.0,
        "total_recebido": 0.0,
        "ganhadoras": 0,
        "acertos_numeros": 0,
        "acertos_especial": 0,
        "maior_premio": 0.0,
        "data_maior_premio": None
    })

    for mes, d in mensais.items():
        ano = mes[:4]
        a = anuais[ano]

        a["total_apostas"] += d["total_apostas"]
        a["total_gasto"] += d["total_gasto"]
        a["total_recebido"] += d["total_recebido"]
        a["ganhadoras"] += d["ganhadoras"]
        a["acertos_numeros"] += d["acertos_numeros"]
        a["acertos_especial"] += d["acertos_especial"]

        if d["maior_premio"] > a["maior_premio"]:
            a["maior_premio"] = d["maior_premio"]
            a["data_maior_premio"] = d["data_maior_premio"]

    for ano, d in anuais.items():
        d["saldo"] = round(d["total_recebido"] - d["total_gasto"], 2)
        d["percentagem_ganhadoras"] = round((d["ganhadoras"] / d["total_apostas"] * 100) if d["total_apostas"] else 0, 2)
        d["media_premios"] = round(d["total_recebido"] / d["ganhadoras"], 2) if d["ganhadoras"] else 0
        d["media_acertos_numeros"] = round(d["acertos_numeros"] / d["total_apostas"], 2)
        d["media_acertos_especial"] = round(d["acertos_especial"] / d["total_apostas"], 2)

    return dict(anuais)


def calcular_globais(estatisticas_por_jogo: Dict) -> Dict:
    global_mensal = defaultdict(lambda: {
        "total_apostas": 0,
        "total_gasto": 0.0,
        "total_recebido": 0.0,
        "ganhadoras": 0,
        "maior_premio": 0.0,
        "data_maior_premio": None
    })

    for jogo, dados_jogo in estatisticas_por_jogo.items():
        for mes, d in dados_jogo.items():
            g = global_mensal[mes]
            g["total_apostas"] += d["total_apostas"]
            g["total_gasto"] += d["total_gasto"]
            g["total_recebido"] += d["total_recebido"]
            g["ganhadoras"] += d["ganhadoras"]

            if d["maior_premio"] > g["maior_premio"]:
                g["maior_premio"] = d["maior_premio"]
                g["data_maior_premio"] = d["data_maior_premio"]

    global_anual = defaultdict(lambda: {
        "total_apostas": 0,
        "total_gasto": 0.0,
        "total_recebido": 0.0,
        "ganhadoras": 0,
        "maior_premio": 0.0,
        "data_maior_premio": None
    })

    for mes, d in global_mensal.items():
        ano = mes[:4]
        g = global_anual[ano]
        g["total_apostas"] += d["total_apostas"]
        g["total_gasto"] += d["total_gasto"]
        g["total_recebido"] += d["total_recebido"]
        g["ganhadoras"] += d["ganhadoras"]

        if d["maior_premio"] > g["maior_premio"]:
            g["maior_premio"] = d["maior_premio"]
            g["data_maior_premio"] = d["data_maior_premio"]

    for d in list(global_mensal.values()) + list(global_anual.values()):
        d["saldo"] = round(d["total_recebido"] - d["total_gasto"], 2)
        d["percentagem_ganhadoras"] = round((d["ganhadoras"] / d["total_apostas"] * 100) if d["total_apostas"] else 0, 2)

    return {"mensal": dict(global_mensal), "anual": dict(global_anual)}


# ===== MAIN =====
def main():
    print("\n📊 GERADOR DE ESTATÍSTICAS COMPLETAS (COM DEBUG)")
    print("=" * 70)

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
            print(f"   ✅ {len(mensais)} meses processados")
        else:
            print(f"   ⚠️ Sem dados para {jogo}")

    if estatisticas["mensal"]:
        estatisticas["global"] = calcular_globais(estatisticas["mensal"])
        print("\n🌍 Estatísticas globais calculadas.")

    os.makedirs(PASTA_RESULTADOS, exist_ok=True)
    with open(FICHEIRO_ESTATISTICAS, "w", encoding="utf-8") as f:
        json.dump(estatisticas, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Estatísticas guardadas em: {FICHEIRO_ESTATISTICAS}")


if __name__ == "__main__":
    main()
