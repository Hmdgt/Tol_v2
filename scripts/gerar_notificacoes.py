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
    """
    Gera um resumo legível do resultado, adaptado para cada jogo.
    Para o Totoloto, considera a possibilidade de acumular prémios (números + Nº da Sorte).
    """
    jogo = resultado.get('_jogo')
    acertos = resultado.get('acertos', {})
    premios = resultado.get('premios', [])
    
    # Se não houver prémios, retorna "Não ganhou" (ou, se preferires, a descrição dos acertos)
    if not premios:
        # Fallback para a descrição antiga, mas podemos simplificar
        if jogo == 'totoloto':
            # Para Totoloto sem prémios, mostramos apenas "Não ganhou"
            return "Não ganhou"
        # Para outros jogos, podemos manter a descrição de acertos (ex: "1 número + 0 estrelas")
        numeros = acertos.get('numeros', 0)
        if 'estrelas' in acertos:
            return f"{numeros} números + {acertos.get('estrelas', 0)} estrelas"
        elif 'dream_number' in acertos:
            dream = acertos.get('dream_number', False)
            return f"{numeros} números {'+ Dream' if dream else ''}"
        return f"{numeros} acertos"
    
    # Calcular total dos prémios
    total = 0.0
    for p in premios:
        valor_str = p.get('valor', '0').replace('€', '').replace(' ', '').replace(',', '.')
        try:
            total += float(valor_str)
        except ValueError:
            pass
    
    total_str = f"€ {total:.2f}".replace('.', ',')
    
    # Tratamento específico para Totoloto
    if jogo == 'totoloto':
        numeros = acertos.get('numeros', 0)
        ns = acertos.get('numero_da_sorte', False)
        
        # Construir descrição dos acertos
        if numeros > 0 and ns:
            desc = f"{numeros} número{'s' if numeros != 1 else ''} + Nº da Sorte"
        elif numeros > 0:
            desc = f"{numeros} número{'s' if numeros != 1 else ''}"
        elif ns:
            desc = "Nº da Sorte"
        else:
            desc = "Nenhum acerto"  # não deve acontecer porque temos prémios
        
        return f"Ganhou: {desc} – Total: {total_str}"
    
    # Para outros jogos, se houver um único prémio, mostramos o nome e valor
    if len(premios) == 1:
        p = premios[0]
        nome = p.get('premio', 'Prémio')
        return f"Ganhou: {nome} – {p.get('valor', total_str)}"
    
    # Fallback (caso haja múltiplos prémios noutro jogo, o que não deve acontecer)
    return f"Ganhou ({len(premios)} prémios) – Total: {total_str}"

def main():
    print("\n🔔 GERADOR DE NOTIFICAÇÕES")
    print("="*60)
    
    # 1. Carregar dados
    resultados_recentes = carregar_resultados_recentes()
    historico = carregar_json(FICHEIRO_NOTIFICACOES_HISTORICO)
    ativas = carregar_json(FICHEIRO_NOTIFICACOES_ATIVAS)
    
    # 2. Criar sets de IDs para busca rápida
    ids_no_historico = {n.get('id') for n in historico if n.get('id')}
    ids_nas_ativas = {n.get('id') for n in ativas if n.get('id')}
    
    novas_notificacoes = []
    
    # 3. Filtragem rigorosa
    for res in resultados_recentes:
        rid = res.get('_id')
        
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
            ids_nas_ativas.add(rid)
            print(f"   ➕ Nova: {rid}")

    if not novas_notificacoes:
        print("📭 Sem notificações novas para adicionar.")
        return

    # 4. Merge e Gravação
    lista_final_ativas = ativas + novas_notificacoes

    with open(FICHEIRO_NOTIFICACOES_ATIVAS, "w", encoding="utf-8") as f:
        json.dump(lista_final_ativas, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Sucesso: {len(novas_notificacoes)} notificações adicionadas.")

if __name__ == "__main__":
    main()
