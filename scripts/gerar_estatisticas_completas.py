#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import glob
import re
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Any, Tuple, Optional

# ===== CONFIGURAÇÃO =====
PASTA_APOSTAS = "apostas/"
PASTA_DADOS = "dados/"
PASTA_RESULTADOS = "resultados/"
FICHEIRO_ESTATISTICAS = os.path.join(PASTA_RESULTADOS, "estatisticas_completas.json")

# Custo base por aposta (em euros) – ajustar conforme os jogos reais
CUSTO_POR_JOGO = {
    "totoloto": 1.0,
    "eurodreams": 2.5,
    "euromilhoes": 2.5,
    "milhao": 1.0,
    # adicionar outros jogos conforme necessário
}

# Mapeamento de nomes de jogos para padrões de ficheiros
PADRAO_SORTEIOS = {
    "totoloto": "totoloto_sc_*.json",
    "eurodreams": "eurodreams_*.json",
    "euromilhoes": "euromilhoes_*.json",
    "milhao": "milhao_*.json",
}

def carregar_apostas(jogo: str) -> List[Dict]:
    """Carrega o ficheiro de apostas de um jogo específico."""
    caminho = os.path.join(PASTA_APOSTAS, f"{jogo}.json")
    if not os.path.exists(caminho):
        return []
    with open(caminho, "r", encoding="utf-8") as f:
        return json.load(f)

def carregar_sorteios(jogo: str) -> Dict[str, List[Dict]]:
    """
    Carrega todos os ficheiros de sorteios de um jogo (por ano).
    Retorna um dicionário {ano: [sorteios]}.
    """
    padrao = PADRAO_SORTEIOS.get(jogo, f"{jogo}_*.json")
    caminho_padrao = os.path.join(PASTA_DADOS, padrao)
    ficheiros = glob.glob(caminho_padrao)
    sorteios_por_ano = {}

    for ficheiro in ficheiros:
        nome = os.path.basename(ficheiro)
        # Extrair ano do nome (ex: totoloto_sc_2026.json -> 2026)
        match = re.search(r'_(\d{4})\.json$', nome)
        if not match:
            continue
        ano = match.group(1)

        with open(ficheiro, "r", encoding="utf-8") as f:
            dados = json.load(f)

        # Alguns ficheiros têm estrutura {ano: [...]}, outros são lista direta
        if isinstance(dados, dict) and ano in dados:
            lista = dados[ano]
        elif isinstance(dados, list):
            lista = dados
        else:
            continue

        # Criar índice para pesquisa rápida (data + concurso)
        indice = {}
        for sorteio in lista:
            chave = f"{sorteio.get('data')}|{sorteio.get('concurso')}"
            indice[chave] = sorteio
        sorteios_por_ano[ano] = {
            "lista": lista,
            "indice": indice
        }
    return sorteios_por_ano

def normalizar_data_para_busca(data_aposta: str) -> str:
    """Converte data ISO (YYYY-MM-DD) para formato DD/MM/YYYY."""
    try:
        ano, mes, dia = data_aposta.split('-')
        return f"{dia}/{mes}/{ano}"
    except:
        return data_aposta

def extrair_numeros_e_especial(aposta: Dict, jogo: str) -> Tuple[List[str], Optional[str]]:
    """
    Extrai números e campo especial (estrelas, dream, etc.) conforme o jogo.
    Retorna (lista_numeros, especial)
    """
    numeros = [str(n).zfill(2) for n in aposta.get("numeros", [])]
    if jogo == "euromilhoes":
        especial = aposta.get("estrelas", [])
        # Para euromilhões, o especial são as estrelas (lista)
        return numeros, especial
    elif jogo == "eurodreams":
        # Dream number é um único número
        especial = str(aposta.get("dream_number", "")).zfill(2)
        return numeros, especial
    elif jogo == "totoloto":
        especial = str(aposta.get("numero_da_sorte", "")).zfill(2)
        return numeros, especial
    elif jogo == "milhao":
        # Milhão tem apenas código, não números
        return [], aposta.get("codigo", "")
    else:
        return numeros, None

def extrair_numeros_e_especial_sorteio(sorteio: Dict, jogo: str) -> Tuple[List[str], Any]:
    """Extrai números e especial do sorteio."""
    numeros = [str(n).zfill(2) for n in sorteio.get("numeros", [])]
    if jogo == "euromilhoes":
        especial = [str(e).zfill(2) for e in sorteio.get("estrelas", [])]
        return numeros, especial
    elif jogo == "eurodreams":
        especial = str(sorteio.get("dream_number", "")).zfill(2)
        return numeros, especial
    elif jogo == "totoloto":
        especial = str(sorteio.get("especial", "")).zfill(2)
        return numeros, especial
    elif jogo == "milhao":
        # Milhão tem código
        return [], sorteio.get("codigo", "")
    else:
        return numeros, None

def calcular_acertos(aposta_numeros: List[str], aposta_especial: Any,
                     sorteio_numeros: List[str], sorteio_especial: Any,
                     jogo: str) -> Dict:
    """
    Calcula acertos para um determinado jogo.
    Retorna dicionário com contagens.
    """
    acertos_numeros = len(set(aposta_numeros) & set(sorteio_numeros))

    if jogo == "euromilhoes":
        # aposta_especial e sorteio_especial são listas de estrelas
        acertos_especial = len(set(aposta_especial) & set(sorteio_especial))
        return {"numeros": acertos_numeros, "especial": acertos_especial}
    elif jogo in ["eurodreams", "totoloto"]:
        # especial é um único número
        acertou_especial = (aposta_especial == sorteio_especial)
        return {"numeros": acertos_numeros, "especial": 1 if acertou_especial else 0}
    elif jogo == "milhao":
        # Milhão: comparação de código
        acertou = (aposta_especial == sorteio_especial)
        return {"numeros": 0, "especial": 1 if acertou else 0}
    else:
        return {"numeros": acertos_numeros, "especial": 0}

def determinar_se_ganhou(acertos: Dict, jogo: str) -> bool:
    """Define se a aposta ganhou algum prémio (critério específico de cada jogo)."""
    if jogo == "euromilhoes":
        # Ganha com 2+ números ou 1+ estrelas (simplificado – na realidade há tabela)
        return acertos["numeros"] >= 2 or acertos["especial"] >= 1
    elif jogo == "eurodreams":
        # Ganha com 2+ números ou acertou dream
        return acertos["numeros"] >= 2 or acertos["especial"] == 1
    elif jogo == "totoloto":
        # Ganha com 2+ números ou acertou especial
        return acertos["numeros"] >= 2 or acertos["especial"] == 1
    elif jogo == "milhao":
        # Ganha se acertou o código
        return acertos["especial"] == 1
    else:
        return False

def extrair_valor_premio(sorteio: Dict, acertos: Dict, jogo: str) -> float:
    """
    Determina o valor do prémio com base nos acertos e na tabela de prémios do sorteio.
    Se não houver informação detalhada, retorna 0.
    """
    premios = sorteio.get("premios", [])
    if not premios:
        return 0.0

    # Lógica simplificada: procurar prémio correspondente ao número de acertos
    # Pode ser melhorada conforme a estrutura real dos prémios
    if jogo == "euromilhoes":
        chave = f"{acertos['numeros']}+{acertos['especial']}"
    elif jogo in ["eurodreams", "totoloto"]:
        if acertos["especial"] and acertos["numeros"] == 0:
            chave = "Nº da Sorte"
        else:
            chave = f"{acertos['numeros']}+{acertos['especial']}"
    elif jogo == "milhao":
        chave = "1º Prémio"  # apenas um prémio
    else:
        return 0.0

    for premio in premios:
        if chave in premio.get("premio", ""):
            valor_str = premio.get("valor", "0")
            # Converte string para float
            return extrair_valor_monetario(valor_str)
    return 0.0

def extrair_valor_monetario(valor_str: str) -> float:
    """Converte string como '€ 1,00' ou '€ 10,50' para float."""
    if not valor_str:
        return 0.0
    valor_limpo = valor_str.replace('€ ', '').replace('.', '').replace(',', '.')
    if 'Reembolso' in valor_limpo:
        return 1.0
    try:
        return float(valor_limpo)
    except ValueError:
        return 0.0

def processar_jogo(jogo: str) -> Dict:
    """
    Processa um jogo: carrega apostas e sorteios, cruza e retorna estatísticas.
    """
    apostas = carregar_apostas(jogo)
    if not apostas:
        return {}

    sorteios_por_ano = carregar_sorteios(jogo)
    if not sorteios_por_ano:
        return {}

    # Dicionário para acumular estatísticas mensais
    stats_mensais = defaultdict(lambda: {
        "total_apostas": 0,
        "total_gasto": 0.0,
        "total_recebido": 0.0,
        "ganhadoras": 0,
        "acertos_numeros": 0,
        "acertos_especial": 0
    })

    custo_base = CUSTO_POR_JOGO.get(jogo, 1.0)

    for aposta in apostas:
        data_sorteio = aposta.get("data_sorteio")
        concurso_aposta = aposta.get("concurso")
        if not data_sorteio:
            continue

        # Extrair ano e mês
        try:
            ano_mes = data_sorteio[:7]  # YYYY-MM
            ano = data_sorteio[:4]
        except:
            continue

        # Obter dados do ano
        dados_ano = sorteios_por_ano.get(ano)
        if not dados_ano:
            continue

        # Normalizar data para busca
        data_busca = normalizar_data_para_busca(data_sorteio)

        # Procurar sorteio
        sorteio = None
        if concurso_aposta:
            chave = f"{data_busca}|{concurso_aposta}"
            sorteio = dados_ano["indice"].get(chave)
        if not sorteio:
            # Fallback: apenas pela data
            for s in dados_ano["lista"]:
                if s.get("data") == data_busca:
                    sorteio = s
                    break
        if not sorteio:
            continue

        # Para cada aposta individual (índice)
        for aposta_ind in aposta.get("apostas", []):
            numeros_aposta, especial_aposta = extrair_numeros_e_especial(aposta_ind, jogo)
            numeros_sorteio, especial_sorteio = extrair_numeros_e_especial_sorteio(sorteio, jogo)

            acertos = calcular_acertos(numeros_aposta, especial_aposta,
                                       numeros_sorteio, especial_sorteio, jogo)
            ganhou = determinar_se_ganhou(acertos, jogo)
            valor_premio = extrair_valor_premio(sorteio, acertos, jogo) if ganhou else 0.0

            # Acumular estatísticas mensais
            mes = stats_mensais[ano_mes]
            mes["total_apostas"] += 1
            mes["total_gasto"] += custo_base
            if ganhou:
                mes["ganhadoras"] += 1
                mes["total_recebido"] += valor_premio
            mes["acertos_numeros"] += acertos.get("numeros", 0)
            mes["acertos_especial"] += acertos.get("especial", 0)

    # Calcular derivados
    for mes, dados in stats_mensais.items():
        dados["saldo"] = dados["total_recebido"] - dados["total_gasto"]
        dados["percentagem_acertos"] = (dados["ganhadoras"] / dados["total_apostas"] * 100) if dados["total_apostas"] > 0 else 0.0
        # Arredondamentos
        for k in ["total_gasto", "total_recebido", "saldo"]:
            dados[k] = round(dados[k], 2)
        dados["percentagem_acertos"] = round(dados["percentagem_acertos"], 2)

    return dict(stats_mensais)

def agregar_anual(mensais: Dict) -> Dict:
    """Agrupa estatísticas mensais por ano."""
    anuais = defaultdict(lambda: {
        "total_apostas": 0,
        "total_gasto": 0.0,
        "total_recebido": 0.0,
        "ganhadoras": 0,
        "acertos_numeros": 0,
        "acertos_especial": 0
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

    # Calcular derivados anuais
    for ano, dados in anuais.items():
        dados["saldo"] = dados["total_recebido"] - dados["total_gasto"]
        dados["percentagem_acertos"] = (dados["ganhadoras"] / dados["total_apostas"] * 100) if dados["total_apostas"] > 0 else 0.0
        for k in ["total_gasto", "total_recebido", "saldo"]:
            dados[k] = round(dados[k], 2)
        dados["percentagem_acertos"] = round(dados["percentagem_acertos"], 2)

    return dict(anuais)

def main():
    print("\n📊 GERADOR DE ESTATÍSTICAS COMPLETAS (DIRETO DE APOSTAS E SORTEIOS)")
    print("="*70)

    jogos = ["totoloto", "euromilhoes", "eurodreams", "milhao"]  # lista a ajustar

    estatisticas = {
        "mensal": {},
        "anual": {},
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

    # Guardar resultados
    os.makedirs(PASTA_RESULTADOS, exist_ok=True)
    with open(FICHEIRO_ESTATISTICAS, "w", encoding="utf-8") as f:
        json.dump(estatisticas, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Estatísticas guardadas em: {FICHEIRO_ESTATISTICAS}")

if __name__ == "__main__":
    main()
