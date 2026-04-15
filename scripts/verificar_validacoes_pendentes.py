import json
import os
import glob
from datetime import datetime
from typing import Dict, List, Set
from pywebpush import webpush, WebPushException

# ===== CONFIGURAÇÃO =====
PASTA_APOSTAS = "apostas/"
FICHEIRO_ESTADO = "apostas/estado_validacoes.json"
SUBSCRIPTION_FILE = "subscription.json"

# Tipos de jogo (devem coincidir com CONFIG.TIPOS_JOGO no frontend)
TIPOS_JOGO = ["euromilhoes", "totoloto", "eurodreams", "milhao"]

# Configuração VAPID (via environment)
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_EMAIL = os.environ.get("VAPID_EMAIL", "mailto:exemplo@dominio.com")
VAPID_CLAIMS = {"sub": VAPID_EMAIL}


def carregar_json(caminho: str):
    if os.path.exists(caminho):
        try:
            with open(caminho, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return [] if "apostas" in caminho else {}
    return [] if "apostas" in caminho else {}


def listar_validacoes_pendentes() -> Dict[str, List[Dict]]:
    """
    Replica a lógica de window.listarBoletinsPorValidar().
    Retorna dicionário: { imagem_origem: [lista de jogos pendentes] }
    """
    boletins_por_imagem = {}

    for tipo in TIPOS_JOGO:
        caminho = os.path.join(PASTA_APOSTAS, f"{tipo}.json")
        if not os.path.exists(caminho):
            continue

        with open(caminho, "r", encoding="utf-8") as f:
            try:
                content = json.load(f)
            except:
                continue

        if not isinstance(content, list):
            continue

        nao_confirmados = [j for j in content if not j.get("confirmado", False)]

        for jogo in nao_confirmados:
            imagem = jogo.get("imagem_origem")
            if not imagem:
                continue

            if imagem not in boletins_por_imagem:
                boletins_por_imagem[imagem] = {
                    "tipo": jogo.get("tipo"),
                    "lista": []
                }

            # Ignorar tipos diferentes na mesma imagem (como no JS)
            if boletins_por_imagem[imagem]["tipo"] != jogo.get("tipo"):
                print(f"   ⚠️ Tipo inconsistente na imagem {imagem}, ignorado.")
                continue

            boletins_por_imagem[imagem]["lista"].append(jogo)

    # Formato final: { imagem: [jogos] }
    resultado = {}
    for imagem, dados in boletins_por_imagem.items():
        resultado[imagem] = dados["lista"]

    return resultado


def gerar_id_validacao(imagem: str, jogo: Dict) -> str:
    """ID único baseado na imagem e hash (persistente)."""
    hash_img = jogo.get("hash_imagem", "")
    return f"valid_{imagem}_{hash_img}"


def carregar_estado_anterior() -> Set[str]:
    estado = carregar_json(FICHEIRO_ESTADO)
    if isinstance(estado, dict):
        return set(estado.get("notificados", []))
    return set()


def guardar_estado_atual(ids_notificados: Set[str]):
    with open(FICHEIRO_ESTADO, "w", encoding="utf-8") as f:
        json.dump({
            "notificados": list(ids_notificados),
            "ultima_verificacao": datetime.now().isoformat()
        }, f, indent=2)


def enviar_push_validacao(jogo: str, quantidade: int, imagem: str = None) -> bool:
    if not VAPID_PRIVATE_KEY or not os.path.exists(SUBSCRIPTION_FILE):
        return False

    with open(SUBSCRIPTION_FILE, "r", encoding="utf-8") as f:
        try:
            subscriptions = json.load(f)
        except:
            return False

    if isinstance(subscriptions, dict):
        subscriptions = [subscriptions]
    if not subscriptions:
        return False

    payload = {
        "title": f"{jogo.upper()} - Validação pendente" if jogo else "Validação pendente",
        "body": f"Tens {quantidade} boletim(ns) por validar!",
        "tag": f"validacao-{jogo}-{imagem}" if imagem else f"validacao-{jogo}",
        "icon": "/Tol_v2/icons/icon-192.png",
        "badge": "/Tol_v2/icons/icon-192.png",
        "url": "/Tol_v2/",
        "timestamp": datetime.now().isoformat()
    }
    data = json.dumps(payload)

    sucesso = 0
    valid_subs = []

    for sub in subscriptions:
        try:
            webpush(subscription_info=sub, data=data,
                    vapid_private_key=VAPID_PRIVATE_KEY, vapid_claims=VAPID_CLAIMS)
            valid_subs.append(sub)
            sucesso += 1
        except WebPushException as ex:
            if ex.response and ex.response.status_code == 410:
                print("   🗑️ Subscription expirada removida.")
            else:
                valid_subs.append(sub)
        except:
            valid_subs.append(sub)

    if len(valid_subs) != len(subscriptions):
        with open(SUBSCRIPTION_FILE, "w", encoding="utf-8") as f:
            json.dump(valid_subs, f, indent=2)

    print(f"   ✅ Push enviada para {sucesso} dispositivo(s).")
    return sucesso > 0


def main():
    print("\n🔍 VERIFICADOR DE VALIDAÇÕES PENDENTES")
    print("=" * 60)

    pendentes = listar_validacoes_pendentes()
    estado_anterior = carregar_estado_anterior()

    ids_atuais = set()
    for imagem, jogos in pendentes.items():
        for jogo in jogos:
            ids_atuais.add(gerar_id_validacao(imagem, jogo))

    novas_ids = ids_atuais - estado_anterior
    if not novas_ids:
        print("📭 Nenhuma validação nova.")
        return

    print(f"📬 {len(novas_ids)} nova(s) validação(ões) pendente(s).")

    # Agrupar por tipo de jogo para enviar apenas um push por jogo
    jogos_com_novas = {}
    for imagem, jogos in pendentes.items():
        if any(gerar_id_validacao(imagem, j) in novas_ids for j in jogos):
            tipo = jogos[0].get("tipo", "Jogo")
            if tipo not in jogos_com_novas:
                jogos_com_novas[tipo] = {"quantidade": 0, "imagem": imagem}
            jogos_com_novas[tipo]["quantidade"] += len(jogos)

    for tipo, info in jogos_com_novas.items():
        enviar_push_validacao(tipo, info["quantidade"], info["imagem"])

    estado_anterior.update(novas_ids)
    guardar_estado_atual(estado_anterior)
    print("✅ Estado atualizado.")


if __name__ == "__main__":
    main()
