import json
import os
import glob
from datetime import datetime
from typing import Dict, List

# ===== CONFIGURAÇÃO =====
PASTA_RESULTADOS = "resultados/"
FICHEIRO_NOTIFICACOES_ATIVAS = os.path.join(PASTA_RESULTADOS, "notificacoes_ativas.json")
FICHEIRO_NOTIFICACOES_HISTORICO = os.path.join(PASTA_RESULTADOS, "notificacoes_historico.json")

def gerar_id_unico(resultado: dict, jogo: str) -> str:
    """Gera ID único para cada notificação"""
    referencia = resultado.get('boletim', {}).get('referencia', 'sem_ref')
    indice = resultado.get('aposta', {}).get('indice', 1)
    data = resultado.get('data_verificacao', datetime.now().isoformat())[:10]
    return f"{jogo}_{referencia}_{indice}_{data}"

def carregar_resultados_recentes() -> List[Dict]:
    """Carrega todos os ficheiros *_recentes.json"""
    todos_resultados = []
    
    padrao = os.path.join(PASTA_RESULTADOS, "*_recentes.json")
    ficheiros = glob.glob(padrao)
    
    print(f"📁 Encontrados {len(ficheiros)} ficheiros recentes")
    
    for ficheiro in ficheiros:
        nome = os.path.basename(ficheiro)
        jogo = nome.replace('_recentes.json', '')
        
        try:
            with open(ficheiro, "r", encoding="utf-8") as f:
                resultados = json.load(f)
            
            print(f"   📊 {jogo}: {len(resultados)} resultados")
            
            for resultado in resultados:
                # Adicionar metadados do jogo
                resultado['_jogo'] = jogo
                resultado['_id'] = gerar_id_unico(resultado, jogo)
                todos_resultados.append(resultado)
                
        except Exception as e:
            print(f"   ❌ Erro em {ficheiro}: {e}")
    
    return todos_resultados

def carregar_historico() -> List[Dict]:
    """Carrega histórico de notificações"""
    if os.path.exists(FICHEIRO_NOTIFICACOES_HISTORICO):
        with open(FICHEIRO_NOTIFICACOES_HISTORICO, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def carregar_ativas() -> List[Dict]:
    """Carrega notificações ativas existentes"""
    if os.path.exists(FICHEIRO_NOTIFICACOES_ATIVAS):
        with open(FICHEIRO_NOTIFICACOES_ATIVAS, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def garantir_historico():
    """Garante que o ficheiro de histórico existe (mesmo vazio)"""
    if not os.path.exists(FICHEIRO_NOTIFICACOES_HISTORICO):
        with open(FICHEIRO_NOTIFICACOES_HISTORICO, "w", encoding="utf-8") as f:
            json.dump([], f)
        print("📁 Criado ficheiro de histórico vazio")

def gerar_resumo(resultado: dict) -> str:
    """Gera um resumo legível do resultado"""
    acertos = resultado.get('acertos', {})
    numeros = acertos.get('numeros', 0)
    
    if 'estrelas' in acertos:
        estrelas = acertos.get('estrelas', 0)
        return f"{numeros} números + {estrelas} estrelas"
    elif 'dream_number' in acertos:
        dream = acertos.get('dream_number', False)
        return f"{numeros} números {'+ Dream' if dream else ''}"
    elif 'numero_da_sorte' in acertos:
        sorte = acertos.get('numero_da_sorte', False)
        return f"{numeros} números {'+ Nº Sorte' if sorte else ''}"
    else:
        return f"{numeros} acertos"

def main():
    print("\n🔔 GERADOR DE NOTIFICAÇÕES")
    print("="*60)
    
    # Garantir que o histórico existe
    garantir_historico()
    
    # 1. Carregar resultados recentes
    resultados_recentes = carregar_resultados_recentes()
    
    if not resultados_recentes:
        print("📭 Nenhum resultado recente encontrado")
        return
    
    # 2. Carregar histórico e ativas
    historico = carregar_historico()
    ativas = carregar_ativas()
    
    # 3. Criar conjunto de IDs já processados
    ids_historico = {n.get('_id') for n in historico if n.get('_id')}
    ids_ativas = {n.get('_id') for n in ativas if n.get('_id')}
    ids_existentes = ids_historico.union(ids_ativas)
    
    # 4. Adicionar apenas resultados NOVOS
    novas_notificacoes = []
    for resultado in resultados_recentes:
        resultado_id = resultado.get('_id')
        
        if resultado_id not in ids_existentes:
            # Criar notificação formatada para PWA
            notificacao = {
                "id": resultado_id,
                "jogo": resultado.get('_jogo'),
                "data": resultado.get('data_verificacao'),
                "lido": False,
                "titulo": f"🎫 Novo resultado {resultado.get('_jogo').upper()}",
                "subtitulo": f"Boletim: {resultado.get('boletim', {}).get('referencia', 'N/A')}",
                "resumo": gerar_resumo(resultado),
                "detalhes": resultado  # Guardar resultado completo
            }
            novas_notificacoes.append(notificacao)
            print(f"   ➕ Nova: {notificacao['id']}")
    
    # 5. Juntar com ativas existentes (que ainda não foram lidas)
    todas_ativas = ativas + novas_notificacoes
    
    # 6. Guardar notificações ativas (SUBSTITUIR)
    with open(FICHEIRO_NOTIFICACOES_ATIVAS, "w", encoding="utf-8") as f:
        json.dump(todas_ativas, f, indent=2, ensure_ascii=False)
    
    print(f"\n📊 Resumo:")
    print(f"   📌 Ativas anteriores: {len(ativas)}")
    print(f"   ➕ Novas: {len(novas_notificacoes)}")
    print(f"   📌 Total ativas agora: {len(todas_ativas)}")
    print(f"   📚 Histórico: {len(historico)}")
    print(f"\n📁 Ficheiro atualizado: {FICHEIRO_NOTIFICACOES_ATIVAS}")

if __name__ == "__main__":
    main()
