import json
import os
import glob
import re
from datetime import datetime
from typing import Dict, List, Optional

# ===== CONFIGURAÇÃO =====
FICHEIRO_APOSTAS = "apostas/m1lhão.json"
PASTA_DADOS = "dados/"
FICHEIRO_RESULTADOS = "resultados/milhao_verificacoes.json"

def carregar_todos_sorteios() -> dict:
    """
    Carrega todos os ficheiros de sorteios (milhao_ANO.json)
    IGNORA milhao_atual.json porque é apenas o último sorteio
    """
    todos_sorteios = {}
    
    padrao = os.path.join(PASTA_DADOS, "milhao_*.json")
    ficheiros = glob.glob(padrao)
    
    if not ficheiros:
        print(f"⚠️ Nenhum ficheiro de sorteios encontrado em {PASTA_DADOS}")
        return {}
    
    for ficheiro in ficheiros:
        nome = os.path.basename(ficheiro)
        
        if nome == "milhao_atual.json":
            print(f"   ⏭️ Ignorando {nome} (apenas último sorteio)")
            continue
        
        match = re.search(r'milhao_(\d{4})\.json', nome)
        if not match:
            print(f"   ⏭️ Ignorando {nome} (formato não reconhecido)")
            continue
        
        ano = match.group(1)
        
        try:
            with open(ficheiro, "r", encoding="utf-8") as f:
                dados = json.load(f)
            
            if ano in dados and isinstance(dados[ano], list):
                # Criar índice para pesquisa rápida por DATA + CONCURSO
                sorteios_indexados = {}
                for sorteio in dados[ano]:
                    chave = f"{sorteio.get('data')}|{sorteio.get('concurso')}"
                    sorteios_indexados[chave] = sorteio
                
                # Também criar índice por código premiado (para verificar se ganhou)
                codigos_premiados = {}
                for sorteio in dados[ano]:
                    codigo = sorteio.get('codigo', '').replace(' ', '')
                    if codigo:
                        # Limpar código (remover espaços)
                        codigo_limpo = re.sub(r'\s+', '', codigo)
                        codigos_premiados[codigo_limpo] = {
                            'sorteio': sorteio,
                            'concurso': sorteio.get('concurso'),
                            'data': sorteio.get('data'),
                            'premio_nome': sorteio.get('premio_nome', '1.º Prémio'),
                            'vencedores': sorteio.get('vencedores', '1')
                        }
                
                todos_sorteios[ano] = {
                    "lista": dados[ano],
                    "index": sorteios_indexados,
                    "codigos_premiados": codigos_premiados
                }
                print(f"   📅 Carregados {len(dados[ano])} sorteios de {ano}")
            else:
                print(f"⚠️ Formato inválido em {ficheiro}")
                
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

def limpar_codigo(codigo: str) -> str:
    """
    Limpa o código (remove espaços, normaliza formato)
    Ex: "GQC 37079" → "GQC37079"
        "GQC37079"  → "GQC37079"
    """
    if not codigo:
        return ""
    return re.sub(r'\s+', '', codigo).upper()

def verificar_boletins(apostas: list, todos_sorteios: dict) -> list:
    """
    Verifica todos os boletins M1lhão contra os sorteios
    Para o M1lhão, a validação é simples: o código da aposta tem que coincidir
    com o código premiado no sorteio da data correspondente
    """
    resultados = []
    
    for aposta in apostas:
        data_aposta = aposta.get("data_sorteio")
        
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
        
        # Encontrar sorteio pela data
        sorteio_encontrado = None
        for sorteio in dados_ano["lista"]:
            if sorteio.get("data") == data_sorteio_formatada:
                sorteio_encontrado = sorteio
                break
        
        if not sorteio_encontrado:
            print(f"⚠️ Sorteio não encontrado para data {data_aposta}")
            continue
        
        # Código premiado neste sorteio
        codigo_premiado = limpar_codigo(sorteio_encontrado.get('codigo', ''))
        
        # Verificar cada aposta (índice)
        # Nota: algumas apostas podem ter "codigo" diretamente no nível superior
        # ou dentro de "apostas"
        apostas_list = aposta.get("apostas", [])
        
        # Se não houver lista de apostas, pode ser formato antigo com código direto
        if not apostas_list and aposta.get("codigo"):
            # Criar aposta virtual
            apostas_list = [{"indice": 1, "codigo": aposta.get("codigo")}]
        
        for aposta_ind in apostas_list:
            codigo_aposta = limpar_codigo(aposta_ind.get("codigo", ""))
            
            if not codigo_aposta:
                continue
            
            # Verificar se ganhou
            ganhou = (codigo_aposta == codigo_premiado)
            
            # Criar resultado
            resultado = {
                "data_verificacao": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "boletim": {
                    "referencia": aposta.get("referencia_unica"),
                    "data_sorteio": aposta.get("data_sorteio"),
                    "imagem_origem": aposta.get("imagem_origem")
                },
                "aposta": {
                    "indice": aposta_ind.get("indice", 1),
                    "codigo": codigo_aposta,
                    "codigo_original": aposta_ind.get("codigo", "")
                },
                "sorteio": {
                    "concurso": sorteio_encontrado.get("concurso"),
                    "data": sorteio_encontrado.get("data"),
                    "codigo_premiado": codigo_premiado,
                    "codigo_original": sorteio_encontrado.get('codigo', ''),
                    "premio_nome": sorteio_encontrado.get('premio_nome', '1.º Prémio'),
                    "vencedores": sorteio_encontrado.get('vencedores', '1')
                },
                "ganhou": ganhou
            }
            
            # Adicionar informação de prémio
            if ganhou:
                resultado["premio"] = {
                    "categoria": sorteio_encontrado.get('premio_nome', '1.º Prémio'),
                    "descricao": "Código premiado",
                    "valor": "€ 1.000.000,00",  # Valor fixo do M1lhão
                    "vencedores": sorteio_encontrado.get('vencedores', '1')
                }
            else:
                resultado["premio"] = {
                    "categoria": "Sem prémio",
                    "descricao": "Código não premiado",
                    "valor": "€ 0,00"
                }
            
            resultados.append(resultado)
            
            # Mostrar resultado imediato
            mostrar_resultado_simples(resultado)
    
    return resultados

def mostrar_resultado_simples(resultado: dict):
    """Mostra resultado formatado no terminal"""
    print("\n" + "="*70)
    print(f"📅 Sorteio: {resultado['sorteio']['concurso']} - {resultado['sorteio']['data']}")
    print(f"🎫 Boletim: {resultado['boletim']['referencia']} (índice {resultado['aposta']['indice']})")
    print(f"   Código apostado: {resultado['aposta']['codigo']}")
    print(f"   Código premiado: {resultado['sorteio']['codigo_premiado']}")
    
    if resultado.get('ganhou'):
        print(f"   🏆 GANHOU: {resultado['premio']['categoria']}!")
        print(f"   💰 Prémio: {resultado['premio']['valor']}")
        print(f"   📊 Total de vencedores: {resultado['sorteio']['vencedores']}")
    else:
        print(f"   ❌ Não ganhou - código não premiado")
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
                existente.get("aposta", {}).get("indice") == novo["aposta"]["indice"]):
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
    
    print("\n" + "📊"*35)
    print("📈 RELATÓRIO FINAL - M1LHÃO")
    print("📊"*35)
    print(f"Total de códigos verificados: {total}")
    print(f"Códigos premiados: {ganhadores}")
    
    if ganhadores > 0:
        print("\n🏆 PRÉMIOS OBTIDOS:")
        print(f"   🎉 {ganhadores} código(s) premiado(s)!")
        
        # Mostrar quais códigos ganharam
        for r in resultados:
            if r.get('ganhou'):
                print(f"      - {r['aposta']['codigo']} (sorteio {r['sorteio']['concurso']})")

def main():
    """Função principal"""
    print("\n🔍 VERIFICADOR DE BOLETINS M1LHÃO")
    print("="*70)
    print(f"📁 Apostas: {FICHEIRO_APOSTAS}")
    print(f"📁 Pasta de dados: {PASTA_DADOS}")
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
