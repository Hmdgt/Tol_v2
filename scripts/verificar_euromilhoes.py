import json
import os
import glob
import re
from datetime import datetime
from typing import Dict, List, Tuple, Optional

# ===== CONFIGURACAO =====
FICHEIRO_APOSTAS = "apostas/euromilhoes.json"
PASTA_DADOS = "dados/"
FICHEIRO_RESULTADOS = "resultados/euromilhoes_verificacoes.json"

# ===== TABELA DE PREMIOS EUROMILHOES =====
PREMIOS_EUROMILHOES = {
    (5, 2): "1. Prémio",
    (5, 1): "2. Prémio",
    (5, 0): "3. Prémio",
    (4, 2): "4. Prémio",
    (4, 1): "5. Prémio",
    (3, 2): "6. Prémio",
    (4, 0): "7. Prémio",
    (2, 2): "8. Prémio",
    (3, 1): "9. Prémio",
    (3, 0): "10. Prémio",
    (1, 2): "11. Prémio",
    (2, 1): "12. Prémio",
    (2, 0): "13. Prémio"
}

# ============================================================
# NOVAS FUNÇÕES DE NORMALIZAÇÃO
# ============================================================

def normalizar(texto):
    """Remove acentos, ordinais e pontuação para comparações exatas."""
    texto = texto.lower()
    texto = re.sub(r'[ºª]', '', texto)           # remove ordinais
    texto = re.sub(r'[^a-z0-9 ]', '', texto)     # remove pontuação
    texto = re.sub(r'\s+', ' ', texto).strip()   # normaliza espaços
    return texto

def encontrar_premio_por_nome(lista_premios, nome_esperado):
    """Procura um prémio na lista ignorando diferenças de acentos/ordinais."""
    if not nome_esperado:
        return None
    esperado_norm = normalizar(nome_esperado)
    for p in lista_premios:
        if normalizar(p.get("premio", "")) == esperado_norm:
            return p
    return None

# ============================================================
# FUNÇÕES ORIGINAIS (mantidas intactas exceto a modificação abaixo)
# ============================================================

def carregar_todos_sorteios() -> dict:
    """
    Carrega todos os ficheiros de sorteios (euromilhoes_ANO.json)
    Ignora euromilhoes_atual.json porque e apenas o ultimo sorteio
    """
    todos_sorteios = {}
    
    padrao = os.path.join(PASTA_DADOS, "euromilhoes_*.json")
    ficheiros = glob.glob(padrao)
    
    if not ficheiros:
        print(f"Aviso: Nenhum ficheiro de sorteios encontrado em {PASTA_DADOS}")
        return {}
    
    for ficheiro in ficheiros:
        nome = os.path.basename(ficheiro)
        
        if nome == "euromilhoes_atual.json":
            print(f"   Ignorando {nome} (apenas ultimo sorteio)")
            continue
        
        match = re.search(r'euromilhoes_(\d{4})\.json', nome)
        if not match:
            print(f"   Ignorando {nome} (formato nao reconhecido)")
            continue
        
        ano = match.group(1)
        
        try:
            with open(ficheiro, "r", encoding="utf-8") as f:
                dados = json.load(f)
            
            if ano in dados and isinstance(dados[ano], list):
                sorteios_indexados = {}
                for sorteio in dados[ano]:
                    chave = f"{sorteio.get('data')}|{sorteio.get('concurso')}"
                    sorteios_indexados[chave] = sorteio
                
                todos_sorteios[ano] = {
                    "lista": dados[ano],
                    "index": sorteios_indexados
                }
                print(f"   Carregados {len(dados[ano])} sorteios de {ano}")
            else:
                print(f"Aviso: Formato invalido em {ficheiro}")
                
        except Exception as e:
            print(f"Erro ao carregar {ficheiro}: {e}")
    
    return todos_sorteios

def carregar_json(ficheiro: str):
    """Carrega um ficheiro JSON de apostas"""
    if not os.path.exists(ficheiro):
        print(f"Aviso: Ficheiro nao encontrado: {ficheiro}")
        return []
    
    with open(ficheiro, "r", encoding="utf-8") as f:
        return json.load(f)

def converter_data(data_str: str) -> str:
    """Converte data para formato comparavel (YYYY-MM-DD)"""
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
    Tenta extrair numero de concurso da referencia unica do boletim
    Ex: "551-05455705-M1L" -> None (nao tem concurso)
    Mas alguns boletins podem ter o numero do concurso
    """
    return None

def extrair_chave_sorteio(chave_str: str) -> Tuple[List[str], List[str]]:
    """Extrai numeros e estrelas da string da chave"""
    partes = chave_str.split('+')
    numeros = partes[0].strip().split()
    estrelas = partes[1].strip().split() if len(partes) > 1 else []
    
    numeros = [n.zfill(2) for n in numeros]
    estrelas = [e.zfill(2) for e in estrelas]
    
    return numeros, estrelas

def calcular_acertos(aposta_numeros: List[str], aposta_estrelas: List[str],
                     sorteio_numeros: List[str], sorteio_estrelas: List[str]) -> Tuple[int, int]:
    """Calcula quantos numeros e estrelas acertou"""
    acertos_numeros = len(set(aposta_numeros) & set(sorteio_numeros))
    acertos_estrelas = len(set(aposta_estrelas) & set(sorteio_estrelas))
    return acertos_numeros, acertos_estrelas

def encontrar_premio(sorteio: dict, acertos_n: int, acertos_e: int) -> Optional[dict]:
    """Encontra o premio correspondente na lista de premios do sorteio (com procura normalizada)"""
    chave_premio = (acertos_n, acertos_e)
    nome_premio = PREMIOS_EUROMILHOES.get(chave_premio)
    
    if not nome_premio:
        return None
    
    # 👇 Alteração principal: usa a procura normalizada em vez da comparação exata
    return encontrar_premio_por_nome(sorteio.get("premios", []), nome_premio)

def verificar_boletins(apostas: list, todos_sorteios: dict) -> list:
    """
    Verifica todos os boletins contra os sorteios usando DUPLA VALIDACAO:
    1. Data do sorteio
    2. Numero do concurso (se disponivel no boletim)
    """
    resultados = []
    
    for aposta in apostas:
        data_aposta = aposta.get("data_sorteio")
        
        try:
            ano_aposta = data_aposta.split('-')[0]
        except:
            print(f"Aviso: Data invalida: {data_aposta}")
            continue
        
        dados_ano = todos_sorteios.get(ano_aposta)
        if not dados_ano:
            print(f"Aviso: Nenhum sorteio encontrado para o ano {ano_aposta}")
            continue
        
        data_sorteio_formatada = normalizar_data_para_busca(data_aposta)
        concurso_aposta = aposta.get("concurso")
        
        sorteio_encontrado = None
        metodo_encontrado = ""
        
        if concurso_aposta:
            chave_exata = f"{data_sorteio_formatada}|{concurso_aposta}"
            sorteio_encontrado = dados_ano["index"].get(chave_exata)
            if sorteio_encontrado:
                metodo_encontrado = "data + concurso"
        
        if not sorteio_encontrado:
            for sorteio in dados_ano["lista"]:
                if sorteio.get("data") == data_sorteio_formatada:
                    sorteio_encontrado = sorteio
                    metodo_encontrado = "apenas data"
                    break
        
        if not sorteio_encontrado:
            print(f"Aviso: Sorteio nao encontrado para data {data_aposta}")
            continue
        
        numeros_sorteio, estrelas_sorteio = extrair_chave_sorteio(sorteio_encontrado.get("chave", ""))
        
        for aposta_ind in aposta.get("apostas", []):
            numeros_aposta = aposta_ind.get("numeros", [])
            estrelas_aposta = aposta_ind.get("estrelas", [])
            
            acertos_n, acertos_e = calcular_acertos(
                numeros_aposta, estrelas_aposta,
                numeros_sorteio, estrelas_sorteio
            )
            
            numeros_acertados = sorted(list(set(numeros_aposta) & set(numeros_sorteio)))
            estrelas_acertadas = sorted(list(set(estrelas_aposta) & set(estrelas_sorteio)))
            
            premio = encontrar_premio(sorteio_encontrado, acertos_n, acertos_e)
            
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
                    "descricao": f"{acertos_n} numero(s) e {acertos_e} estrela(s)",
                    "numeros_acertados": numeros_acertados,
                    "estrelas_acertadas": estrelas_acertadas
                }
            }
            
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
                        "categoria": "Sem premio",
                        "descricao": "Nao corresponde a qualquer premio",
                        "valor": "EUR 0,00"
                    }
                else:
                    resultado["premio"] = {
                        "categoria": "Sem premio",
                        "descricao": "0 acertos",
                        "valor": "EUR 0,00"
                    }
            
            resultados.append(resultado)
            mostrar_resultado_simples(resultado, metodo_encontrado)
    
    return resultados

def mostrar_resultado_simples(resultado: dict, metodo: str):
    """Mostra resultado formatado no terminal"""
    print("\n" + "="*70)
    print(f"Sorteio: {resultado['sorteio']['concurso']} - {resultado['sorteio']['data']}")
    print(f"Boletim: {resultado['boletim']['referencia']} (indice {resultado['aposta']['indice']})")
    print(f"   Validacao por: {metodo.upper()}")
    print(f"   Aposta:   {' '.join(resultado['aposta']['numeros'])} + {' '.join(resultado['aposta']['estrelas'])}")
    print(f"   Sorteio:  {' '.join(resultado['sorteio']['numeros'])} + {' '.join(resultado['sorteio']['estrelas'])}")
    print(f"   Acertos:  {resultado['acertos']['numeros']} numeros, {resultado['acertos']['estrelas']} estrelas")
    
    if resultado.get('ganhou'):
        print(f"   GANHOU: {resultado['premio']['categoria']}")
        print(f"   Premio: {resultado['premio']['valor']}")
    else:
        if resultado['acertos']['numeros'] > 0 or resultado['acertos']['estrelas'] > 0:
            print(f"   Nao ganhou premio (combinacao nao premiada)")
        else:
            print(f"   Nenhum acerto")
    print("="*70)

def guardar_resultados(resultados: list):
    """
    Guarda resultados em dois formatos:
    1. INCREMENTAL: historico completo (nunca apaga)
    2. SUBSTITUIDO: apenas os resultados desta execucao
    """
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
    
    print(f"\nHistorico guardado em: {FICHEIRO_RESULTADOS}")
    print(f"Novas verificacoes no historico: {novos_adicionados}")
    print(f"Total no historico: {len(historico)}")
    
    if resultados:
        nome_base = os.path.basename(FICHEIRO_RESULTADOS)
        nome_recentes = nome_base.replace('_verificacoes', '_recentes')
        caminho_recentes = os.path.join("resultados", nome_recentes)
        
        with open(caminho_recentes, "w", encoding="utf-8") as f:
            json.dump(resultados, f, indent=2, ensure_ascii=False)
        
        print(f"Resultados recentes guardados em: {caminho_recentes}")
        print(f"Total de resultados recentes: {len(resultados)}")

def gerar_relatorio(resultados: list):
    """Gera relatorio sumario"""
    if not resultados:
        return
    
    total = len(resultados)
    ganhadores = sum(1 for r in resultados if r.get('ganhou'))
    
    print("\n" + "="*70)
    print("RELATORIO FINAL")
    print("="*70)
    print(f"Total de apostas verificadas: {total}")
    print(f"Apostas premiadas: {ganhadores}")
    
    if ganhadores > 0:
        print("\nPREMIOS OBTIDOS:")
        premios_contagem = {}
        for r in resultados:
            if r.get('ganhou'):
                cat = r['premio']['categoria']
                premios_contagem[cat] = premios_contagem.get(cat, 0) + 1
        
        for cat, count in sorted(premios_contagem.items()):
            print(f"   {cat}: {count}")

def main():
    """Funcao principal"""
    print("\nVERIFICADOR DE BOLETINS EUROMILHOES (DUPLA VALIDACAO)")
    print("="*70)
    print(f"Apostas: {FICHEIRO_APOSTAS}")
    print(f"Pasta de dados: {PASTA_DADOS}")
    print(f"Resultados: {FICHEIRO_RESULTADOS}")
    print("="*70)
    
    apostas = carregar_json(FICHEIRO_APOSTAS)
    if not apostas:
        print("ERRO: Nenhuma aposta encontrada")
        return
    
    print("\nA carregar sorteios...")
    todos_sorteios = carregar_todos_sorteios()
    
    if not todos_sorteios:
        print("ERRO: Nenhum sorteio encontrado")
        return
    
    total_sorteios = sum(len(d["lista"]) for d in todos_sorteios.values())
    print(f"\nApostas carregadas: {len(apostas)}")
    print(f"Sorteios carregados: {total_sorteios} (de {len(todos_sorteios)} anos)")
    
    resultados = verificar_boletins(apostas, todos_sorteios)
    
    if resultados:
        guardar_resultados(resultados)
        gerar_relatorio(resultados)
    else:
        print("\nNenhum resultado para verificar")

if __name__ == "__main__":
    main()
