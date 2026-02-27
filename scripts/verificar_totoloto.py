import json
import os
import glob
import re
from datetime import datetime
from typing import Dict, List, Tuple, Optional

# ===== CONFIGURAÇÃO =====
FICHEIRO_APOSTAS = "apostas/totoloto.json"
PASTA_DADOS = "dados/"
# Nome específico do ficheiro de sorteios (diferente do padrão)
FICHEIRO_SORTEIOS_PADRAO = "totoloto_sc_*.json"
FICHEIRO_RESULTADOS = "resultados/totoloto_verificacoes.json"

# ===== TABELA DE PRÉMIOS TOTOLOTO =====
# Formato: acertos_numeros -> nome do prémio (apenas para números)
PREMIOS_NUMEROS_TOTOLOTO = {
    5: "2.º Prémio",  # 5 números (sem especial)
    4: "3.º Prémio",  # 4 números
    3: "4.º Prémio",  # 3 números
    2: "5.º Prémio",  # 2 números
}

def carregar_todos_sorteios() -> dict:
    """
    Carrega todos os ficheiros de sorteios (totoloto_sc_ANO.json)
    IGNORA totoloto_sc_atual.json porque é apenas o último sorteio
    """
    todos_sorteios = {}
    
    padrao = os.path.join(PASTA_DADOS, FICHEIRO_SORTEIOS_PADRAO)
    ficheiros = glob.glob(padrao)
    
    if not ficheiros:
        print(f"⚠️ Nenhum ficheiro de sorteios encontrado em {PASTA_DADOS} com padrão {FICHEIRO_SORTEIOS_PADRAO}")
        return {}
    
    for ficheiro in ficheiros:
        nome = os.path.basename(ficheiro)
        
        if nome == "totoloto_sc_atual.json":
            print(f"   ⏭️ Ignorando {nome} (apenas último sorteio)")
            continue
        
        # Padrão: totoloto_sc_2026.json → extrair ano
        match = re.search(r'totoloto_sc_(\d{4})\.json', nome)
        if not match:
            print(f"   ⏭️ Ignorando {nome} (formato não reconhecido)")
            continue
        
        ano = match.group(1)
        
        try:
            with open(ficheiro, "r", encoding="utf-8") as f:
                dados = json.load(f)
            
            # O ficheiro pode ter estrutura { "2026": [...] } ou ser diretamente uma lista
            if ano in dados and isinstance(dados[ano], list):
                lista_sorteios = dados[ano]
            elif isinstance(dados, list):
                lista_sorteios = dados
                print(f"   ⚠️ Ficheiro {nome} é uma lista direta, assumindo ano {ano}")
            else:
                print(f"⚠️ Formato inválido em {ficheiro}")
                continue
            
            # Criar índice para pesquisa rápida por DATA + CONCURSO
            sorteios_indexados = {}
            for sorteio in lista_sorteios:
                chave = f"{sorteio.get('data')}|{sorteio.get('concurso')}"
                sorteios_indexados[chave] = sorteio
            
            todos_sorteios[ano] = {
                "lista": lista_sorteios,
                "index": sorteios_indexados
            }
            print(f"   📅 Carregados {len(lista_sorteios)} sorteios de {ano}")
                
        except Exception as e:
            print(f"❌ Erro ao carregar {ficheiro}: {e}")
    
    return todos_sorteios

def carregar_json(ficheiro: str):
    """Carrega um ficheiro JSON de apostas"""
    if not os.path.exists(ficheiro):
        print(f"⚠️ Ficheiro não encontrado: {ficheiro}")
        return []
    
    with open(ficheiro, "r", encoding="utf-8") as f:
        return json.load(f)

def converter_data(data_str: str) -> str:
    """Converte data para formato comparável (YYYY-MM-DD)"""
    if len(data_str) == 10 and data_str[4] == '-':
        return data_str
    
    try:
        dia, mes, ano = data_str.split('/')
        return f"{ano}-{mes}-{dia}"
    except:
        return data_str

def normalizar_data_para_busca(data_aposta: str) -> str:
    """
    Converte data do formato ISO (YYYY-MM-DD) para o formato do sorteio (DD/MM/YYYY)
    """
    try:
        ano, mes, dia = data_aposta.split('-')
        return f"{dia}/{mes}/{ano}"
    except:
        return data_aposta

def extrair_numeros_sorteio(sorteio: dict) -> Tuple[List[str], str]:
    """
    Extrai números e número especial do sorteio
    """
    numeros = [str(n).zfill(2) for n in sorteio.get("numeros", [])]
    especial = str(sorteio.get("especial", "")).zfill(2)
    
    return numeros, especial

def calcular_acertos(aposta_numeros: List[str], aposta_especial: str,
                     sorteio_numeros: List[str], sorteio_especial: str) -> Tuple[int, bool]:
    """
    Calcula quantos números acertou e se acertou o número da sorte
    """
    acertos_numeros = len(set(aposta_numeros) & set(sorteio_numeros))
    acertou_especial = (aposta_especial == sorteio_especial)
    
    return acertos_numeros, acertou_especial

def encontrar_premios(sorteio: dict, acertos_n: int, acertou_especial: bool) -> List[dict]:
    """
    Encontra TODOS os prémios correspondentes (pode haver acumulação)
    """
    premios_ganhos = []
    
    # CASO 1: Acertou o Nº da Sorte (sempre dá reembolso)
    if acertou_especial:
        for premio in sorteio.get("premios", []):
            if premio.get("premio") == "Nº da Sorte":
                premios_ganhos.append(premio)
                break
    
    # CASO 2: Prémios por números (apenas se acertou 2+ números)
    if acertos_n >= 2:
        nome_premio = PREMIOS_NUMEROS_TOTOLOTO.get(acertos_n)
        if nome_premio:
            for premio in sorteio.get("premios", []):
                if premio.get("premio") == nome_premio:
                    premios_ganhos.append(premio)
                    break
    
    # CASO 3: Caso especial - 5 números + Nº da Sorte (1.º Prémio)
    if acertos_n == 5 and acertou_especial:
        # Procurar 1.º Prémio (substitui o 2.º Prémio)
        for premio in sorteio.get("premios", []):
            if premio.get("premio") == "1.º Prémio":
                # Remover o 2.º Prémio se tiver sido adicionado
                premios_ganhos = [p for p in premios_ganhos if p.get("premio") != "2.º Prémio"]
                premios_ganhos.append(premio)
                break
    
    return premios_ganhos

def calcular_valor_total(premios: List[dict]) -> str:
    """
    Calcula o valor total somando todos os prémios
    """
    total = 0.0
    
    for premio in premios:
        valor_str = premio.get("valor", "0")
        # Remover "€ " e converter vírgula para ponto
        valor_limpo = valor_str.replace("€ ", "").replace(".", "").replace(",", ".")
        try:
            # Caso especial: reembolso (texto em vez de número)
            if "Reembolso" in valor_str:
                total += 1.0  # €1,00 por aposta simples
            else:
                total += float(valor_limpo)
        except:
            # Se não conseguir converter, ignorar
            pass
    
    # Formatar de volta para o padrão
    if total == 0:
        return "€ 0,00"
    elif total == 1.0 and any("Reembolso" in p.get("valor", "") for p in premios):
        return "€ 1,00 (Reembolso)"
    else:
        return f"€ {total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def verificar_boletins(apostas: list, todos_sorteios: dict) -> list:
    """
    Verifica todos os boletins contra os sorteios usando DUPLA VALIDAÇÃO:
    1. Data do sorteio
    2. Número do concurso (se disponível no boletim)
    """
    resultados = []
    
    for aposta in apostas:
        data_aposta = aposta.get("data_sorteio")
        concurso_aposta = aposta.get("concurso")  # ← VEM DO OCR!
        
        # Extrair ano da data
        try:
            ano_aposta = data_aposta.split('-')[0]
        except:
            print(f"⚠️ Data inválida: {data_aposta}")
            continue
        
        # Obter dados do ano correspondente
        dados_ano = todos_sorteios.get(ano_aposta)
        if not dados_ano:
            print(f"⚠️ Nenhum sorteio encontrado para o ano {ano_aposta}")
            continue
        
        # Preparar data no formato do sorteio (DD/MM/YYYY)
        data_sorteio_formatada = normalizar_data_para_busca(data_aposta)
        
        # ESTRATÉGIA DE BUSCA: Prioridade por DATA + CONCURSO
        sorteio_encontrado = None
        metodo_encontrado = ""
        
        # 1. Tentar por DATA + CONCURSO (se tivermos concurso)
        if concurso_aposta:
            chave_exata = f"{data_sorteio_formatada}|{concurso_aposta}"
            sorteio_encontrado = dados_ano["index"].get(chave_exata)
            if sorteio_encontrado:
                metodo_encontrado = "data + concurso"
        
        # 2. Se não encontrou, tentar só por DATA (fallback)
        if not sorteio_encontrado:
            for sorteio in dados_ano["lista"]:
                if sorteio.get("data") == data_sorteio_formatada:
                    sorteio_encontrado = sorteio
                    metodo_encontrado = "apenas data"
                    break
        
        if not sorteio_encontrado:
            print(f"⚠️ Sorteio não encontrado para data {data_aposta}")
            continue
        
        # Extrair números do sorteio
        numeros_sorteio, especial_sorteio = extrair_numeros_sorteio(sorteio_encontrado)
        
        # Verificar cada aposta (índice)
        for aposta_ind in aposta.get("apostas", []):
            numeros_aposta = aposta_ind.get("numeros", [])
            especial_aposta = aposta_ind.get("numero_da_sorte", "")
            
            # Calcular acertos
            acertos_n, acertou_especial = calcular_acertos(
                numeros_aposta, especial_aposta,
                numeros_sorteio, especial_sorteio
            )
            
            # Encontrar TODOS os prémios
            premios_ganhos = encontrar_premios(sorteio_encontrado, acertos_n, acertou_especial)
            
            # Criar resultado base
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
            
            # Adicionar informação de prémios
            if premios_ganhos:
                resultado["ganhou"] = True
                resultado["premios"] = premios_ganhos
                resultado["valor_total"] = calcular_valor_total(premios_ganhos)
                
                # Para compatibilidade com código existente
                if len(premios_ganhos) == 1:
                    resultado["premio"] = premios_ganhos[0]
                else:
                    # Múltiplos prémios
                    categorias = [p.get("premio") for p in premios_ganhos]
                    resultado["premio"] = {
                        "categoria": " + ".join(categorias),
                        "descricao": "Acumulação de prémios",
                        "valor": resultado["valor_total"]
                    }
            else:
                resultado["ganhou"] = False
                resultado["premios"] = []
                if acertos_n > 0 or acertou_especial:
                    resultado["premio"] = {
                        "categoria": "Sem prémio",
                        "descricao": "Não corresponde a qualquer prémio",
                        "valor": "€ 0,00"
                    }
                else:
                    resultado["premio"] = {
                        "categoria": "Sem prémio",
                        "descricao": "0 acertos",
                        "valor": "€ 0,00"
                    }
            
            resultados.append(resultado)
            
            # Mostrar resultado imediato
            mostrar_resultado_simples(resultado, metodo_encontrado)
    
    return resultados

def mostrar_resultado_simples(resultado: dict, metodo: str):
    """Mostra resultado formatado no terminal"""
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
        # Verifica se há múltiplos prémios
        if len(resultado.get('premios', [])) > 1:
            print(f"   🏆 ACUMULAÇÃO DE PRÉMIOS:")
            for p in resultado['premios']:
                print(f"      • {p['premio']}: {p['valor']}")
            print(f"   💰 TOTAL: {resultado['valor_total']}")
        else:
            # Caso de prémio único (pode estar em 'premios' ou em 'premio')
            if resultado.get('premios'):
                p = resultado['premios'][0]
                categoria = p.get('premio', 'Desconhecido')
                valor = p.get('valor', '€ 0,00')
            else:
                premio = resultado.get('premio', {})
                categoria = premio.get('categoria', 'Desconhecido')
                valor = premio.get('valor', '€ 0,00')
            print(f"   🏆 GANHOU: {categoria}")
            print(f"   💰 Prémio: {valor}")
        
        # Verifica se inclui reembolso (pode aparecer em qualquer prémio)
        if any("Reembolso" in p.get("valor", "") for p in resultado.get('premios', [])):
            print(f"   🔄 Inclui reembolso do valor da aposta")
    else:
        if resultado['acertos']['numeros'] > 0 or resultado['acertos']['numero_da_sorte']:
            print(f"   ❌ Não ganhou prémio (combinação não premiada)")
        else:
            print(f"   ❌ Nenhum acerto")
    print("="*70)

def guardar_resultados(resultados: list):
    """
    Guarda resultados em dois formatos:
    1. INCREMENTAL: histórico completo (nunca apaga)
    2. SUBSTITUÍDO: apenas os resultados desta execução
    """
    os.makedirs("resultados", exist_ok=True)
    
    # ===== 1. FICHEIRO INCREMENTAL (histórico) =====
    if os.path.exists(FICHEIRO_RESULTADOS):
        with open(FICHEIRO_RESULTADOS, "r", encoding="utf-8") as f:
            historico = json.load(f)
    else:
        historico = []
    
    # Adicionar apenas os NOVOS ao histórico
    novos_adicionados = 0
    for novo in resultados:
        existe = False
        for existente in historico:
            if (existente.get("boletim", {}).get("referencia") == novo["boletim"]["referencia"] and
                existente.get("aposta", {}).get("indice") == novo["aposta"]["indice"] and
                existente.get("data_verificacao") == novo["data_verificacao"]):
                existe = True
                break
        
        if not existe:
            historico.append(novo)
            novos_adicionados += 1
    
    # Guardar histórico completo (INCREMENTAL)
    with open(FICHEIRO_RESULTADOS, "w", encoding="utf-8") as f:
        json.dump(historico, f, indent=2, ensure_ascii=False)
    
    print(f"\n📁 Histórico guardado em: {FICHEIRO_RESULTADOS}")
    print(f"📊 Novas verificações no histórico: {novos_adicionados}")
    print(f"📊 Total no histórico: {len(historico)}")
    
    # ===== 2. FICHEIRO DE RESULTADOS RECENTES (SUBSTITUÍDO) =====
    if resultados:
        # Nome do ficheiro de resultados recentes
        nome_base = os.path.basename(FICHEIRO_RESULTADOS)
        nome_recentes = nome_base.replace('_verificacoes', '_recentes')
        caminho_recentes = os.path.join("resultados", nome_recentes)
        
        # Guardar APENAS os resultados desta execução (SUBSTITUI)
        with open(caminho_recentes, "w", encoding="utf-8") as f:
            json.dump(resultados, f, indent=2, ensure_ascii=False)
        
        print(f"📁 Resultados recentes guardados em: {caminho_recentes}")
        print(f"📊 Total de resultados recentes: {len(resultados)}")

def gerar_relatorio(resultados: list):
    """Gera relatório sumário"""
    if not resultados:
        return
    
    total = len(resultados)
    ganhadores = sum(1 for r in resultados if r.get('ganhou'))
    
    # Contar reembolsos (qualquer aposta com Nº da Sorte)
    reembolsos = sum(1 for r in resultados if r.get('acertos', {}).get('numero_da_sorte'))
    
    # Contar acumulações
    acumulacoes = sum(1 for r in resultados if len(r.get('premios', [])) > 1)
    
    print("\n" + "📊"*35)
    print("📈 RELATÓRIO FINAL - TOTOLOTO")
    print("📊"*35)
    print(f"Total de apostas verificadas: {total}")
    print(f"Apostas premiadas: {ganhadores}")
    print(f"   - Prémios em dinheiro (2+ números): {ganhadores - reembolsos + acumulacoes}")
    print(f"   - Reembolsos (Nº da Sorte): {reembolsos}")
    print(f"   - Acumulações (prémio + reembolso): {acumulacoes}")
    
    if ganhadores > 0:
        print("\n🏆 PRÉMIOS OBTIDOS:")
        premios_contagem = {}
        for r in resultados:
            if r.get('ganhou'):
                if len(r.get('premios', [])) > 1:
                    # Contar cada prémio individualmente para estatísticas
                    for p in r['premios']:
                        cat = p['premio']
                        premios_contagem[cat] = premios_contagem.get(cat, 0) + 1
                else:
                    cat = r['premio']['categoria']
                    premios_contagem[cat] = premios_contagem.get(cat, 0) + 1
        
        for cat, count in sorted(premios_contagem.items()):
            print(f"   {cat}: {count}")

def main():
    """Função principal"""
    print("\n🔍 VERIFICADOR DE BOLETINS TOTOLOTO (DUPLA VALIDAÇÃO)")
    print("="*70)
    print(f"📁 Apostas: {FICHEIRO_APOSTAS}")
    print(f"📁 Pasta de dados: {PASTA_DADOS}")
    print(f"📁 Padrão de ficheiros: {FICHEIRO_SORTEIOS_PADRAO}")
    print(f"📁 Resultados: {FICHEIRO_RESULTADOS}")
    print("="*70)
    
    # Carregar apostas
    apostas = carregar_json(FICHEIRO_APOSTAS)
    if not apostas:
        print("❌ Nenhuma aposta encontrada")
        return
    
    # Carregar todos os sorteios de todos os anos
    print("\n📚 A carregar sorteios...")
    todos_sorteios = carregar_todos_sorteios()
    
    if not todos_sorteios:
        print("❌ Nenhum sorteio encontrado")
        return
    
    total_sorteios = sum(len(d["lista"]) for d in todos_sorteios.values())
    print(f"\n📚 Apostas carregadas: {len(apostas)}")
    print(f"📚 Sorteios carregados: {total_sorteios} (de {len(todos_sorteios)} anos)")
    
    # Verificar boletins
    resultados = verificar_boletins(apostas, todos_sorteios)
    
    if resultados:
        guardar_resultados(resultados)
        gerar_relatorio(resultados)
    else:
        print("\n❌ Nenhum resultado para verificar")

if __name__ == "__main__":
    main()
