import json
import os
from datetime import datetime
from typing import Dict, List, Tuple, Optional

# ===== CONFIGURAÇÃO =====
FICHEIRO_APOSTAS = "apostas/euromilhoes.json"
FICHEIRO_SORTEIOS = "dados/euromilhoes_2026.json"  # ← ALTERADO
FICHEIRO_RESULTADOS = "resultados/euromilhoes_verificacoes.json"  # ← COM SUFIXO

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

def carregar_json(ficheiro: str) -> dict:
    """Carrega um ficheiro JSON"""
    if not os.path.exists(ficheiro):
        print(f"⚠️ Ficheiro não encontrado: {ficheiro}")
        return {} if "dados" in ficheiro else []
    
    with open(ficheiro, "r", encoding="utf-8") as f:
        return json.load(f)

def converter_data(data_str: str) -> str:
    """Converte data para formato comparável (YYYY-MM-DD)"""
    # Se já está no formato ISO
    if len(data_str) == 10 and data_str[4] == '-':
        return data_str
    
    # Se está no formato PT (DD/MM/YYYY)
    try:
        dia, mes, ano = data_str.split('/')
        return f"{ano}-{mes}-{dia}"
    except:
        return data_str

def extrair_chave_sorteio(chave_str: str) -> Tuple[List[str], List[str]]:
    """
    Extrai números e estrelas da string da chave
    Ex: "13 24 28 33 35 + 5 9" → (["13","24","28","33","35"], ["05","09"])
    """
    partes = chave_str.split('+')
    numeros = partes[0].strip().split()
    estrelas = partes[1].strip().split() if len(partes) > 1 else []
    
    # Garantir 2 dígitos
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
    """
    Encontra o prémio correspondente na lista de prémios do sorteio
    """
    chave_premio = (acertos_n, acertos_e)
    nome_premio = PREMIOS_EUROMILHOES.get(chave_premio)
    
    if not nome_premio:
        return None
    
    # Procurar na lista de prémios do sorteio
    for premio in sorteio.get("premios", []):
        if premio.get("premio") == nome_premio:
            return premio
    
    return None

def verificar_boletins(apostas: list, sorteios_por_ano: dict) -> list:
    """
    Verifica todos os boletins contra os sorteios
    """
    resultados = []
    
    for aposta in apostas:
        data_aposta = aposta.get("data_sorteio")  # Data do sorteio para que foi feita a aposta
        
        # Procurar sorteio correspondente
        sorteio_encontrado = None
        
        for ano, sorteios in sorteios_por_ano.items():
            for sorteio in sorteios:
                data_sorteio = converter_data(sorteio.get("data", ""))
                if data_sorteio == data_aposta:
                    sorteio_encontrado = sorteio
                    break
            if sorteio_encontrado:
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
                "boletim": {
                    "referencia": aposta.get("referencia_unica"),
                    "data_sorteio": aposta.get("data_sorteio"),
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
            mostrar_resultado_simples(resultado)
    
    return resultados

def mostrar_resultado_simples(resultado: dict):
    """Mostra resultado formatado no terminal"""
    print("\n" + "="*60)
    print(f"📅 Sorteio: {resultado['sorteio']['concurso']} - {resultado['sorteio']['data']}")
    print(f"🎫 Boletim: {resultado['boletim']['referencia']} (índice {resultado['aposta']['indice']})")
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
    print("="*60)

def guardar_resultados(resultados: list):
    """Guarda resultados num ficheiro JSON"""
    os.makedirs("resultados", exist_ok=True)
    
    # Carregar resultados existentes
    if os.path.exists(FICHEIRO_RESULTADOS):
        with open(FICHEIRO_RESULTADOS, "r", encoding="utf-8") as f:
            historico = json.load(f)
    else:
        historico = []
    
    # Adicionar novos resultados (evitar duplicados por referência + índice)
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
    
    # Guardar
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
    
    print("\n" + "📊"*30)
    print("📈 RELATÓRIO FINAL")
    print("📊"*30)
    print(f"Total de apostas verificadas: {total}")
    print(f"Apostas premiadas: {ganhadores}")
    
    if ganhadores > 0:
        print("\n🏆 PRÉMIOS OBTIDOS:")
        # Agrupar por categoria de prémio
        premios_contagem = {}
        for r in resultados:
            if r.get('ganhou'):
                cat = r['premio']['categoria']
                premios_contagem[cat] = premios_contagem.get(cat, 0) + 1
        
        for cat, count in sorted(premios_contagem.items()):
            print(f"   {cat}: {count}")

def main():
    """Função principal"""
    print("\n🔍 VERIFICADOR DE BOLETINS EUROMILHÕES")
    print("="*60)
    print(f"📁 Apostas: {FICHEIRO_APOSTAS}")
    print(f"📁 Sorteios: {FICHEIRO_SORTEIOS}")
    print(f"📁 Resultados: {FICHEIRO_RESULTADOS}")
    print("="*60)
    
    # Carregar dados
    apostas = carregar_json(FICHEIRO_APOSTAS)
    sorteios = carregar_json(FICHEIRO_SORTEIOS)
    
    if not apostas:
        print("❌ Nenhuma aposta encontrada")
        return
    
    if not sorteios:
        print("❌ Nenhum sorteio encontrado")
        return
    
    # Contar sorteios (considerando que pode ser dicionário com anos)
    if isinstance(sorteios, dict):
        total_sorteios = sum(len(s) for s in sorteios.values())
    else:
        total_sorteios = len(sorteios)
        # Converter para formato consistente
        if isinstance(sorteios, list):
            # Se for lista, colocar dentro de um dicionário com ano
            ano_atual = datetime.now().strftime("%Y")
            sorteios = {ano_atual: sorteios}
    
    print(f"📚 Apostas carregadas: {len(apostas)}")
    print(f"📚 Sorteios carregados: {total_sorteios}")
    
    # Verificar boletins
    resultados = verificar_boletins(apostas, sorteios)
    
    if resultados:
        # Guardar resultados
        guardar_resultados(resultados)
        
        # Gerar relatório
        gerar_relatorio(resultados)
    else:
        print("\n❌ Nenhum resultado para verificar")

if __name__ == "__main__":
    main()
