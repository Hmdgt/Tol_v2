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
    """
    Gera ID único persistente. 
    Removida a data para evitar que o mesmo boletim gere novas notificações em dias diferentes.
    """
    referencia = resultado.get('boletim', {}).get('referencia', 'sem_ref')
    indice = resultado.get('aposta', {}).get('indice', 1)
    # O ID agora é fixo para aquele boletim específico
    return f"{jogo}_{referencia}_{indice}"

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
            
            for resultado in resultados:
                resultado['_jogo'] = jogo
                # Gerar o ID aqui para comparação posterior
                resultado['_id'] = gerar_id_unico(resultado, jogo)
                todos_resultados.append(resultado)
                
        except Exception as e:
            print(f"   ❌ Erro em {ficheiro}: {e}")
    
    return todos_resultados

def carregar_json(caminho: str) -> List[Dict]:
    """Função genérica para carregar ficheiros JSON"""
    if os.path.exists(caminho):
        try:
            with open(caminho, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return []
    return []

def gerar_resumo(resultado: dict) -> str:
    """Gera um resumo legível do resultado"""
    acertos = resultado.get('acertos', {})
    numeros = acertos.get('numeros', 0)
    
    if 'estrelas' in acertos:
        return f"{numeros} números + {acertos.get('estrelas', 0)} estrelas"
    elif 'dream_number' in acertos:
        dream = acertos.get('dream_number', False)
        return f"{numeros} números {'+ Dream' if dream else ''}"
    return f"{numeros} acertos"

def main():
    print("\n🔔 GERADOR DE NOTIFICAÇÕES")
    print("="*60)
    
    # 1. Carregar dados
    resultados_recentes = carregar_resultados_recentes()
    historico = carregar_json(FICHEIRO_NOTIFICACOES_HISTORICO)
    ativas = carregar_json(FICHEIRO_NOTIFICACOES_ATIVAS)
    
    # 2. Criar sets de IDs para busca rápida
    # IMPORTANTE: No histórico o campo chama-se 'id', no resultado recente usamos '_id'
    ids_no_historico = {n.get('id') for n in historico if n.get('id')}
    ids_nas_ativas = {n.get('id') for n in ativas if n.get('id')}
    
    novas_notificacoes = []
    
    # 3. Filtragem rigorosa
    for res in resultados_recentes:
        rid = res.get('_id')
        
        # SÓ adiciona se não estiver no histórico NEM nas ativas
        if rid not in ids_no_historico and rid not in ids_nas_ativas:
            notificacao = {
                "id": rid,
                "jogo": res.get('_jogo'),
                "data": res.get('data_verificacao', datetime.now().isoformat()),
                "lido": False,
                "titulo": f"🎫 Novo resultado {res.get('_jogo').upper()}",
                "subtitulo": f"Boletim: {res.get('boletim', {}).get('referencia', 'N/A')}",
                "resumo": gerar_resumo(res),
                "detalhes": res
            }
            novas_notificacoes.append(notificacao)
            ids_nas_ativas.add(rid) # Evita duplicados no mesmo lote
            print(f"   ➕ Nova: {rid}")

    if not novas_notificacoes:
        print("📭 Sem notificações novas para adicionar.")
        return

    # 4. Merge e Gravação
    # Mantemos o que já era ativo e adicionamos as novas
    lista_final_ativas = ativas + novas_notificacoes

    with open(FICHEIRO_NOTIFICACOES_ATIVAS, "w", encoding="utf-8") as f:
        json.dump(lista_final_ativas, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Sucesso: {len(novas_notificacoes)} notificações adicionadas.")

if __name__ == "__main__":
    main()
