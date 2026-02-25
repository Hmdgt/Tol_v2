import json
import os
import glob
import re
from datetime import datetime
from typing import Dict, List, Tuple, Optional

# ===== CONFIGURAÇÃO =====
FICHEIRO_APOSTAS = "apostas/euromilhoes.json"
PASTA_DADOS = "dados/"
FICHEIRO_RESULTADOS = "resultados/euromilhoes_verificacoes.json"

# ===== TABELA DE PRÉMIOS EUROMILHÕES =====
PREMIOS_EUROMILHOES = {
    (5, 2): "1.º Prémio",
    (5, 1): "2.º Prémio", 
    (5, 0): "3.º Prémio",
    (4, 2): "4.º Prémio",
    (4, 1): "5.º Prémio",
    (3, 2): "6.º Prémio",
    (4, 0): "7.º Prémio",
    (2, 2): "8.º Prémio",
    (3, 1): "9.º Prémio",
    (3, 0): "10.º Prémio",
    (1, 2): "11.º Prémio",
    (2, 1): "12.º Prémio",
    (2, 0): "13.º Prémio"
}

def carregar_todos_sorteios() -> dict:
    """
    Carrega todos os ficheiros de sorteios (euromilhoes_ANO.json)
    IGNORA euromilhoes_atual.json porque é apenas o último sorteio
    """
    todos_sorteios = {}
    
    padrao = os.path.join(PASTA_DADOS, "euromilhoes_*.json")
    ficheiros = glob.glob(padrao)
    
    if not ficheiros:
        print(f"⚠️ Nenhum ficheiro de sorteios encontrado em {PASTA_DADOS}")
        return {}
    
    for ficheiro in ficheiros:
        nome = os.path.basename(ficheiro)
        
        if nome == "euromilhoes_atual.json":
            print(f"   ⏭️ Ignorando {nome} (apenas último sorteio)")
            continue
        
        match = re.search(r'euromilhoes_(\d{4})\.json', nome)
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
                
                todos_sorteios[ano] = {
                    "lista": dados[ano],
                    "index": sorteios_indexados
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

def extrair_concurso_referencia(referencia: str) -> Optional[str]:
    """
    Tenta extrair número de concurso da referência única do boletim
    Ex: "551-05455705-M1L" → None (não tem concurso)
    Mas alguns boletins podem ter o número do concurso
    """
    # Por agora, não extraímos concurso da referência
    # Mas fica a função para futura implementação
    return None

def extrair_chave_sorteio(chave_str: str) -> Tuple[List[str], List[str]]:
    """Extrai números e estrelas da string da chave"""
    partes = chave_str.split('+')
    numeros = partes[0].strip().split()
    estrelas = partes[1].strip().split() if len(partes) > 1 else []
    
    numeros = [n.zfill(2) for n in numeros]
    estrelas = [e.zfill(2) for e in estrelas]
    
    return numeros, estrelas

def calcular_acertos(aposta_numeros: List[str], aposta_estrelas: List[str], 
                     sorteio_numeros: List[str], sorteio_estrelas: List[str]) -> Tuple[int, int]:
    """Calcula quantos números e estrelas acertou"""
    acertos_numeros = len(set(aposta_numeros) & set(sorteio_numeros))
    acertos_estrelas = len(set(aposta_estrelas) & set(sorteio_estrelas))
    return acertos_numeros, acertos_estrelas

def encontrar_premio(sorteio: dict, acertos_n: int, acertos_e: int) -> Optional[dict]:
    """Encontra o prémio correspondente na lista de prémios do sorteio"""
    chave_premio = (acertos_n, acertos_e)
    nome_premio = PREMIOS_EUROMILHOES.get(chave_premio)
    
    if not nome_premio:
        return None
    
    for premio in sorteio.get("premios", []):
        if premio.get("premio") == nome_premio:
            return premio
    
    return None

def verificar_boletins(apostas: list, todos_sorteios: dict) -> list:
    """
    Verifica todos os boletins contra os sorteios usando DUPLA VALIDAÇÃO:
    1. Data do sorteio
    2. Número do concurso (se disponível no boletim)
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
        
        # Tentar obter concurso da aposta (se existir no futuro)
        concurso_aposta = aposta.get("concurso")  # Por agora, não existe
        
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
        
        # Extrair chave do sorteio
        numeros_sorteio, estrelas_sorteio = extrair_chave_sorteio(sorteio_encontrado.get("chave", ""))
        
        # Verificar cada aposta (índice)
        for aposta_ind in aposta.get("apostas", []):
            numeros_aposta = aposta_ind.get("numeros", [])
            estrelas_aposta = aposta_ind.get("estrelas", [])
            
            # Calcular acertos
            acertos_n, acertos_e = calcular_acertos(
                numeros_aposta, estrelas_aposta,
                numeros_sorteio, estrelas_sorteio
            )
            
            # Encontrar prémio
            premio = encontrar_premio(sorteio_encontrado, acertos_n, acertos_e)
            
            # Criar resultado
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
                    "indice": aposta_ind.get("indice"),
                    "numeros": numeros_aposta,
                    "estrelas": estrelas_aposta
                },
                "sorteio": {
                    "concurso": sorteio_encontrado.get("concurso"),
                    "data": sorteio_encontrado.get("data"),
                    "chave": sorteio_encontrado.get("chave"),
                    "numeros": numeros_sorteio,
                    "estrelas": estrelas_sorteio
                },
                "acertos": {
                    "numeros": acertos_n,
                    "estrelas": acertos_e,
                    "descricao": f"{acertos_n} número(s) e {acertos_e} estrela(s)"
                }
            }
            
            # Adicionar informação de prémio se houver
            if premio:
                resultado["premio"] = {
                    "categoria": premio.get("premio"),
                    "descricao": premio.get("descricao"),
                    "valor": premio.get("valor", "0"),
                    "vencedores_pt": premio.get("vencedores_pt", "0"),
                    "vencedores_eu": premio.get("vencedores_eu", "0")
                }
                resultado["ganhou"] = True
            else:
                resultado["ganhou"] = False
                if acertos_n > 0 or acertos_e > 0:
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
    print(f"   Aposta:   {' '.join(resultado['aposta']['numeros'])} + {' '.join(resultado['aposta']['estrelas'])}")
    print(f"   Sorteio:  {' '.join(resultado['sorteio']['numeros'])} + {' '.join(resultado['sorteio']['estrelas'])}")
    print(f"   Acertos:  {resultado['acertos']['numeros']} números, {resultado['acertos']['estrelas']} estrelas")
    
    if resultado.get('ganhou'):
        print(f"   🏆 GANHOU: {resultado['premio']['categoria']}")
        print(f"   💰 Prémio: {resultado['premio']['valor']}")
    else:
        if resultado['acertos']['numeros'] > 0 or resultado['acertos']['estrelas'] > 0:
            print(f"   ❌ Não ganhou prémio (combinação não premiada)")
        else:
            print(f"   ❌ Nenhum acerto")
    print("="*70)

def guardar_resultados(resultados: list):
    """Guarda resultados num ficheiro JSON"""
    os.makedirs("resultados", exist_ok=True)
    
    if os.path.exists(FICHEIRO_RESULTADOS):
        with open(FICHEIRO_RESULTADOS, "r", encoding="utf-8") as f:
            historico = json.load(f)
    else:
        historico = []
    
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
    
    with open(FICHEIRO_RESULTADOS, "w", encoding="utf-8") as f:
        json.dump(historico, f, indent=2, ensure_ascii=False)
    
    print(f"\n📁 Resultados guardados em: {FICHEIRO_RESULTADOS}")
    print(f"📊 Novas verificações: {novos_adicionados}")
    print(f"📊 Total no histórico: {len(historico)}")

def gerar_relatorio(resultados: list):
    """Gera relatório sumário"""
    if not resultados:
        return
    
    total = len(resultados)
    ganhadores = sum(1 for r in resultados if r.get('ganhou'))
    
    print("\n" + "📊"*35)
    print("📈 RELATÓRIO FINAL")
    print("📊"*35)
    print(f"Total de apostas verificadas: {total}")
    print(f"Apostas premiadas: {ganhadores}")
    
    if ganhadores > 0:
        print("\n🏆 PRÉMIOS OBTIDOS:")
        premios_contagem = {}
        for r in resultados:
            if r.get('ganhou'):
                cat = r['premio']['categoria']
                premios_contagem[cat] = premios_contagem.get(cat, 0) + 1
        
        for cat, count in sorted(premios_contagem.items()):
            print(f"   {cat}: {count}")

def main():
    """Função principal"""
    print("\n🔍 VERIFICADOR DE BOLETINS EUROMILHÕES (DUPLA VALIDAÇÃO)")
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
