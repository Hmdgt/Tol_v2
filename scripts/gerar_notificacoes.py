import json
import os
import glob
import time
from datetime import datetime
from typing import Dict, List

# Nova dependência para envio direto de Web Push
from pywebpush import webpush, WebPushException

# ===== CONFIGURAÇÃO =====
PASTA_RESULTADOS = "resultados/"
FICHEIRO_NOTIFICACOES_ATIVAS = os.path.join(PASTA_RESULTADOS, "notificacoes_ativas.json")
FICHEIRO_NOTIFICACOES_HISTORICO = os.path.join(PASTA_RESULTADOS, "notificacoes_historico.json")

# GitHub (serão preenchidas pelo environment no Actions)
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "hmdgt/Tol_v2")

# Configuração VAPID para Web Push (via environment)
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE", "")
VAPID_EMAIL = os.environ.get("EMAIL_REMETENTE", "mailto:bot@exemplo.com")
VAPID_CLAIMS = {"sub": VAPID_EMAIL}

# Caminho para o ficheiro que contém as subscriptions
SUBSCRIPTION_FILE = "subscription.json"


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
    
    # Se não houver prémios, retorna "Não ganhou"
    if not premios:
        if jogo == 'totoloto':
            return "Não ganhou"
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
        
        if numeros > 0 and ns:
            desc = f"{numeros} número{'s' if numeros != 1 else ''} + Nº da Sorte"
        elif numeros > 0:
            desc = f"{numeros} número{'s' if numeros != 1 else ''}"
        elif ns:
            desc = "Nº da Sorte"
        else:
            desc = "Nenhum acerto"
        
        return f"Ganhou: {desc} – Total: {total_str}"
    
    # Para outros jogos
    if len(premios) == 1:
        p = premios[0]
        nome = p.get('premio', 'Prémio')
        return f"Ganhou: {nome} – {p.get('valor', total_str)}"
    
    return f"Ganhou ({len(premios)} prémios) – Total: {total_str}"


# ===== NOVA FUNÇÃO: Enviar Web Push diretamente =====
def enviar_web_push_direto(tipo: str, jogo: str) -> bool:
    """
    Envia uma notificação Web Push diretamente para todas as subscriptions ativas.
    Tipo: "resultados" ou "validacao"
    Retorna True se pelo menos um envio foi bem sucedido.
    """
    if not VAPID_PRIVATE_KEY:
        print("   ⚠️ VAPID_PRIVATE_KEY não configurada. Push não será enviada.")
        return False

    if not os.path.exists(SUBSCRIPTION_FILE):
        print(f"   ⚠️ Ficheiro {SUBSCRIPTION_FILE} não encontrado. Push não enviada.")
        return False

    try:
        with open(SUBSCRIPTION_FILE, "r", encoding="utf-8") as f:
            subscriptions = json.load(f)
    except Exception as e:
        print(f"   ❌ Erro ao ler {SUBSCRIPTION_FILE}: {e}")
        return False

    if not subscriptions:
        print("   ℹ️ Nenhuma subscription ativa.")
        return False

    # Garantir que temos uma lista de subscriptions
    if isinstance(subscriptions, dict):
        subscriptions = [subscriptions]

    # Construir payload (estrutura compatível com o Service Worker)
    payload = {
        "title": f"{jogo} - {'Novos resultados!' if tipo == 'resultados' else 'Validação pendente'}",
        "body": "Já saíram os resultados. Vê na app!" if tipo == 'resultados' else "Tens boletins para validar. Verifica na app!",
        "tag": f"{tipo}-{jogo}",
        "icon": "/Tol_v2/icons/icon-192.png",
        "badge": "/Tol_v2/icons/icon-192.png",
        "url": "/Tol_v2/",
        "timestamp": datetime.now().isoformat()
    }
    data = json.dumps(payload)

    sucesso_total = 0
    subscriptions_validas = []

    for sub in subscriptions:
        try:
            webpush(
                subscription_info=sub,
                data=data,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=VAPID_CLAIMS
            )
            subscriptions_validas.append(sub)
            sucesso_total += 1
        except WebPushException as ex:
            if ex.response and ex.response.status_code == 410:
                print(f"   🗑️ Subscription expirada (410) – será removida.")
                # Não a adicionamos à lista de válidas
            elif ex.response and ex.response.status_code in (429, 503):
                print(f"   ⏳ Erro temporário ({ex.response.status_code}). A manter subscription.")
                subscriptions_validas.append(sub)
            else:
                print(f"   ⚠️ Erro no envio: {ex}")
                subscriptions_validas.append(sub)  # Mantemos na dúvida
        except Exception as e:
            print(f"   ❌ Erro inesperado: {e}")
            subscriptions_validas.append(sub)

    # Atualizar ficheiro se houve remoções
    if len(subscriptions_validas) != len(subscriptions):
        try:
            with open(SUBSCRIPTION_FILE, "w", encoding="utf-8") as f:
                json.dump(subscriptions_validas, f, indent=2)
            print(f"   ♻️ {SUBSCRIPTION_FILE} atualizado (removidas {len(subscriptions) - len(subscriptions_validas)} expiradas).")
        except Exception as e:
            print(f"   ⚠️ Erro ao escrever {SUBSCRIPTION_FILE}: {e}")

    print(f"   ✅ Push enviada com sucesso para {sucesso_total} dispositivo(s).")
    return sucesso_total > 0


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
    
    # 5. Enviar Web Pushes diretamente para cada jogo
    print("\n📤 A enviar Web Pushes diretamente...")
    jogos_notificados = set()
    for notif in novas_notificacoes:
        jogo = notif.get('jogo', 'Jogo')
        if jogo not in jogos_notificados:
            enviar_web_push_direto("resultados", jogo)
            jogos_notificados.add(jogo)


if __name__ == "__main__":
    main()
